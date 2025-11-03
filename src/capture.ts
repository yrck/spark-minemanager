import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';
import { getEnv } from './env';
import { redactHeaders } from './redact';
import { saveMultipartFiles } from './storage';
import { logger } from './log';
import { incrementMetrics } from './health';

export async function registerCaptureRoute(fastify: FastifyInstance, prisma: PrismaClient): Promise<void> {
  const env = getEnv();

  // Universal catch-all route
  fastify.all('/*', async (request: FastifyRequest, reply: FastifyReply) => {
    const startTime = Date.now();
    const requestId = ulid();

    try {
      // Skip admin routes (they should be registered before this)
      if (request.url.startsWith('/admin') || request.url.startsWith('/healthz') || request.url.startsWith('/readyz') || request.url.startsWith('/metrics')) {
        return reply.status(404).send({ error: 'Not found' });
      }

      // Extract request details
      const ip = request.ip || request.socket.remoteAddress || undefined;
      const method = request.method;
      const path = request.url.split('?')[0]; // Remove query string
      const query = request.query || {};
      const headers = redactHeaders(request.headers);

      // Determine content type
      const contentType = request.headers['content-type'] || undefined;
      const contentLength = request.headers['content-length']
        ? parseInt(request.headers['content-length'] as string, 10)
        : undefined;

      // Check body size limit
      if (contentLength && contentLength > env.MAX_BODY_BYTES) {
        logger.warn({ requestId, contentLength, maxBytes: env.MAX_BODY_BYTES }, 'Request body exceeds size limit');
      }

      let rawBodyBytes: Buffer | null = null;
      let rawBodyEncoding: string | undefined;
      let truncated = false;
      let hasFiles = false;
      let uploadedFiles: Array<{ id: string; requestId: string; fieldName: string; originalName: string; mimeType: string | null; size: number; diskPath: string }> = [];

      // Handle body based on content type
      if (contentType && contentType.includes('multipart/form-data')) {
        // Multipart handling
        const multipartResult = await saveMultipartFiles(request, requestId, env.UPLOAD_DIR);
        uploadedFiles = multipartResult.files;
        hasFiles = uploadedFiles.length > 0;

        // Store non-file fields as JSON in rawBodyBytes
        const multipartData = {
          hasFiles,
          fileCount: uploadedFiles.length,
          fields: multipartResult.fields,
        };
        rawBodyBytes = Buffer.from(JSON.stringify(multipartData));
        rawBodyEncoding = 'utf8';
      } else if (request.body) {
        // Handle other content types
        if (contentType && contentType.includes('application/json')) {
          // JSON: parse and store raw bytes
          const bodyStr = typeof request.body === 'string' ? request.body : JSON.stringify(request.body);
          rawBodyBytes = Buffer.from(bodyStr, 'utf8');
          rawBodyEncoding = 'utf8';

          // Truncate if too large
          if (rawBodyBytes.length > env.MAX_BODY_BYTES) {
            rawBodyBytes = rawBodyBytes.slice(0, env.MAX_BODY_BYTES);
            truncated = true;
          }
        } else if (
          contentType &&
          (contentType.startsWith('text/') ||
            contentType.includes('application/xml') ||
            contentType.includes('application/x-www-form-urlencoded'))
        ) {
          // Text-based: store as UTF-8
          const bodyStr = typeof request.body === 'string' ? request.body : String(request.body);
          rawBodyBytes = Buffer.from(bodyStr, 'utf8');
          rawBodyEncoding = 'utf8';

          if (rawBodyBytes.length > env.MAX_BODY_BYTES) {
            rawBodyBytes = rawBodyBytes.slice(0, env.MAX_BODY_BYTES);
            truncated = true;
          }
        } else {
          // Binary or unknown: store as base64
          const bodyBuffer = Buffer.isBuffer(request.body)
            ? request.body
            : Buffer.from(String(request.body), 'utf8');
          rawBodyBytes = bodyBuffer.length > env.MAX_BODY_BYTES ? bodyBuffer.slice(0, env.MAX_BODY_BYTES) : bodyBuffer;
          rawBodyEncoding = 'base64';
          truncated = bodyBuffer.length > env.MAX_BODY_BYTES;
        }
      }

      // Create database records
      const capturedRequest = await prisma.capturedRequest.create({
        data: {
          id: requestId,
          ip,
          method,
          path,
          query: query as Record<string, unknown>,
          headers: headers as Record<string, unknown>,
          contentType,
          contentLength,
          rawBodyBytes: rawBodyBytes || undefined,
          rawBodyEncoding,
          truncated,
          hasFiles,
        },
      });

      // Create uploaded file records
      if (uploadedFiles.length > 0) {
        await prisma.uploadedFile.createMany({
          data: uploadedFiles.map((file) => ({
            id: file.id,
            requestId: file.requestId,
            fieldName: file.fieldName,
            originalName: file.originalName,
            mimeType: file.mimeType,
            size: file.size,
            diskPath: file.diskPath,
          })),
        });
      }

      const ms = Date.now() - startTime;
      const bytesIn = rawBodyBytes?.length || 0;

      incrementMetrics(method, 200, bytesIn, uploadedFiles.length);

      logger.info({
        id: requestId,
        method,
        path,
        status: 200,
        bytesIn,
        ms,
      });

      return reply.status(200).send({
        status: 'ok',
        request_id: requestId,
      });
    } catch (error) {
      const ms = Date.now() - startTime;
      logger.error({ requestId, error, ms }, 'Error capturing request');

      // Still return 200 with error info for capture route
      return reply.status(500).send({
        status: 'error',
        request_id: requestId,
        error: 'Internal server error',
      });
    }
  });
}

