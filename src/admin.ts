import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { getEnv } from './env';
import { promises as fs } from 'fs';
import { createReadStream } from 'fs';
import { join } from 'path';

/**
 * Bearer token authentication middleware
 */
async function authenticateAdmin(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const env = getEnv();
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(403).send({
      error: 'Missing or invalid Authorization header',
      message: 'Bearer token required',
    });
  }

  const token = authHeader.substring(7);
  if (token !== env.ADMIN_TOKEN) {
    return reply.status(403).send({
      error: 'Invalid admin token',
      message: 'Authentication failed',
    });
  }
}

/**
 * Register admin routes
 */
export async function registerAdminRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  // Apply auth middleware to all admin routes
  fastify.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/admin')) {
      await authenticateAdmin(request, reply);
    }
  });

  // List requests with filtering and pagination
  fastify.get<{
    Querystring: {
      limit?: string;
      offset?: string;
      method?: string;
      pathPrefix?: string;
      since?: string;
      until?: string;
      hasFiles?: string;
    };
  }>('/admin/requests', async (request, reply) => {
    const {
      limit = '50',
      offset = '0',
      method,
      pathPrefix,
      since,
      until,
      hasFiles,
    } = request.query;

    const limitNum = parseInt(limit, 10);
    const offsetNum = parseInt(offset, 10);

    // Build where clause
    const where: any = {
      deletedAt: null,
    };

    if (method) {
      where.method = method.toUpperCase();
    }

    if (pathPrefix) {
      where.path = { startsWith: pathPrefix };
    }

    if (since || until) {
      where.ts = {};
      if (since) {
        where.ts.gte = new Date(since);
      }
      if (until) {
        where.ts.lte = new Date(until);
      }
    }

    if (hasFiles !== undefined) {
      where.hasFiles = hasFiles === 'true';
    }

    const [requests, total] = await Promise.all([
      prisma.capturedRequest.findMany({
        where,
        orderBy: { ts: 'desc' },
        take: limitNum,
        skip: offsetNum,
        select: {
          id: true,
          ts: true,
          ip: true,
          method: true,
          path: true,
          query: true,
          headers: true,
          contentType: true,
          contentLength: true,
          truncated: true,
          hasFiles: true,
        },
      }),
      prisma.capturedRequest.count({ where }),
    ]);

    // Parse JSON strings back to objects
    const parsedRequests = requests.map((req) => ({
      ...req,
      query: req.query ? JSON.parse(req.query) : {},
      headers: req.headers ? JSON.parse(req.headers) : {},
    }));

    return reply.status(200).send({
      requests: parsedRequests,
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        total,
        hasMore: offsetNum + limitNum < total,
      },
    });
  });

  // Get single request by ID
  fastify.get<{ Params: { id: string } }>('/admin/requests/:id', async (request, reply) => {
    const { id } = request.params;

    const requestRecord = await prisma.capturedRequest.findUnique({
      where: { id },
      include: {
        files: true,
      },
    });

    if (!requestRecord || requestRecord.deletedAt) {
      return reply.status(404).send({
        error: 'Request not found',
      });
    }

    // Encode body as base64 if non-UTF8
    let body: string | { base64: string; encoding: string } | null = null;
    if (requestRecord.rawBodyBytes) {
      if (requestRecord.rawBodyEncoding === 'utf8') {
        body = requestRecord.rawBodyBytes.toString('utf8');
      } else {
        body = {
          base64: requestRecord.rawBodyBytes.toString('base64'),
          encoding: requestRecord.rawBodyEncoding || 'unknown',
        };
      }
    }

    // Parse JSON strings back to objects
    const parsedRequest = {
      ...requestRecord,
      query: requestRecord.query ? JSON.parse(requestRecord.query) : {},
      headers: requestRecord.headers ? JSON.parse(requestRecord.headers) : {},
      rawBodyBytes: undefined, // Don't send binary directly
      body,
    };

    return reply.status(200).send(parsedRequest);
  });

  // List files for a request
  fastify.get<{ Params: { id: string } }>('/admin/requests/:id/files', async (request, reply) => {
    const { id } = request.params;

    const requestRecord = await prisma.capturedRequest.findUnique({
      where: { id },
    });

    if (!requestRecord || requestRecord.deletedAt) {
      return reply.status(404).send({
        error: 'Request not found',
      });
    }

    const files = await prisma.uploadedFile.findMany({
      where: { requestId: id },
    });

    return reply.status(200).send({
      requestId: id,
      files,
    });
  });

  // Download a file
  fastify.get<{ Params: { fileId: string } }>('/admin/files/:fileId', async (request, reply) => {
    const { fileId } = request.params;

    const file = await prisma.uploadedFile.findUnique({
      where: { id: fileId },
      include: {
        request: true,
      },
    });

    if (!file || file.request.deletedAt) {
      return reply.status(404).send({
        error: 'File not found',
      });
    }

    // Check if file exists on disk
    try {
      await fs.access(file.diskPath);
    } catch {
      return reply.status(404).send({
        error: 'File not found on disk',
      });
    }

    const stream = createReadStream(file.diskPath);
    return reply
      .type(file.mimeType || 'application/octet-stream')
      .header('Content-Disposition', `attachment; filename="${file.originalName}"`)
      .send(stream);
  });

  // Soft delete a request
  fastify.delete<{ Params: { id: string } }>('/admin/requests/:id', async (request, reply) => {
    const { id } = request.params;

    const requestRecord = await prisma.capturedRequest.findUnique({
      where: { id },
    });

    if (!requestRecord || requestRecord.deletedAt) {
      return reply.status(404).send({
        error: 'Request not found',
      });
    }

    await prisma.capturedRequest.update({
      where: { id },
      data: {
        deletedAt: new Date(),
      },
    });

    return reply.status(200).send({
      message: 'Request deleted',
      id,
    });
  });

  // Delete requests older than N days
  fastify.delete<{ Querystring: { days?: string } }>(
    '/admin/older-than',
    async (request, reply) => {
      const days = parseInt(request.query.days || '30', 10);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      const result = await prisma.capturedRequest.updateMany({
        where: {
          ts: { lt: cutoffDate },
          deletedAt: null,
        },
        data: {
          deletedAt: new Date(),
        },
      });

      return reply.status(200).send({
        message: `Deleted ${result.count} requests older than ${days} days`,
        deleted: result.count,
      });
    }
  );
}

