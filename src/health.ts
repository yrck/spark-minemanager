import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { getEnv } from './env';

// Simple in-memory metrics (for v1)
interface Metrics {
  totalCaptured: number;
  byMethod: Record<string, number>;
  byStatus: Record<string, number>;
  bytesIn: number;
  filesStored: number;
}

let metrics: Metrics = {
  totalCaptured: 0,
  byMethod: {},
  byStatus: {},
  bytesIn: 0,
  filesStored: 0,
};

export function incrementMetrics(method: string, status: number, bytesIn: number, filesCount: number): void {
  metrics.totalCaptured++;
  metrics.byMethod[method] = (metrics.byMethod[method] || 0) + 1;
  const statusClass = `${Math.floor(status / 100)}xx`;
  metrics.byStatus[statusClass] = (metrics.byStatus[statusClass] || 0) + 1;
  metrics.bytesIn += bytesIn;
  metrics.filesStored += filesCount;
}

export function getMetrics(): Metrics {
  return { ...metrics };
}

export async function registerHealthRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  // Read version from package.json (using require for CommonJS compatibility)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const packageJson = require('../../package.json');
  const version = packageJson.version || '1.0.0';

  // Health check endpoint
  fastify.get('/healthz', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Simple DB connection check
      await prisma.$queryRaw`SELECT 1`;
      return reply.status(200).send({
        ok: true,
        db: 'up',
        version,
      });
    } catch (error) {
      return reply.status(503).send({
        ok: false,
        db: 'down',
        version,
        error: 'Database connection failed',
      });
    }
  });

  // Readiness check endpoint
  fastify.get('/readyz', async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Verify DB is writable by attempting a transaction
      await prisma.$transaction(async (tx) => {
        // Try to create a test record (we'll roll it back)
        const testId = `test-${Date.now()}`;
        await tx.capturedRequest.create({
          data: {
            id: testId,
            method: 'TEST',
            path: '/test',
            query: {},
            headers: {},
          },
        });
        await tx.capturedRequest.delete({
          where: { id: testId },
        });
      });

      return reply.status(200).send({
        ok: true,
        message: 'Service is ready',
      });
    } catch (error) {
      return reply.status(503).send({
        ok: false,
        message: 'Service is not ready',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Metrics endpoint (Prometheus-compatible format)
  fastify.get('/metrics', async (_request: FastifyRequest, reply: FastifyReply) => {
    const m = getMetrics();
    const lines: string[] = [];

    // Total captured
    lines.push(`# HELP total_captured Total number of requests captured`);
    lines.push(`# TYPE total_captured counter`);
    lines.push(`total_captured ${m.totalCaptured}`);

    // By method
    lines.push(`# HELP captured_by_method Number of requests captured by HTTP method`);
    lines.push(`# TYPE captured_by_method counter`);
    for (const [method, count] of Object.entries(m.byMethod)) {
      lines.push(`captured_by_method{method="${method}"} ${count}`);
    }

    // By status class
    lines.push(`# HELP captured_by_status Number of requests captured by HTTP status class`);
    lines.push(`# TYPE captured_by_status counter`);
    for (const [status, count] of Object.entries(m.byStatus)) {
      lines.push(`captured_by_status{status="${status}"} ${count}`);
    }

    // Bytes in
    lines.push(`# HELP bytes_in Total bytes received in request bodies`);
    lines.push(`# TYPE bytes_in counter`);
    lines.push(`bytes_in ${m.bytesIn}`);

    // Files stored
    lines.push(`# HELP files_stored Total number of files stored from multipart uploads`);
    lines.push(`# TYPE files_stored counter`);
    lines.push(`files_stored ${m.filesStored}`);

    return reply
      .type('text/plain')
      .status(200)
      .send(lines.join('\n') + '\n');
  });
}

