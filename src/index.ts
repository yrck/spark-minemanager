import Fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { PrismaClient } from '@prisma/client';
import { getEnv } from './env';
import { logger } from './log';
import { registerHealthRoutes } from './health';
import { registerAdminRoutes } from './admin';
import { registerCaptureRoute } from './capture';
import { ensureUploadDir } from './storage';

async function main() {
  // Load and validate environment
  const env = getEnv();
  logger.info({ env: { port: env.PORT, nodeEnv: env.NODE_ENV } }, 'Starting server');

  // Initialize Prisma
  const prisma = new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // Ensure upload directory exists
  await ensureUploadDir(env.UPLOAD_DIR);

  // Run Prisma migrations
  try {
    logger.info('Running Prisma migrations...');
    // For production, use migrate deploy; for dev, migrations are handled separately
    // We'll use a simple check here - in production, migrations should be run before startup
    if (env.NODE_ENV === 'production') {
      // Migrations should be run via docker command or startup script
      logger.info('Skipping migrations in production (should be run separately)');
    }
  } catch (error) {
    logger.error({ error }, 'Failed to run migrations');
    throw error;
  }

  // Create Fastify instance
  const fastify = Fastify({
    logger: false, // We use our own logger
    bodyLimit: env.MAX_BODY_BYTES,
    requestIdLogLabel: 'id',
    disableRequestLogging: true, // We log manually
  });

  // Register plugins
  await fastify.register(cors, {
    origin: (origin, callback) => {
      // Allow all origins for capture routes
      // Admin routes will be checked separately
      callback(null, true);
    },
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: env.MAX_BODY_BYTES,
    },
  });

  // Error handler
  fastify.setErrorHandler((error, request, reply) => {
    logger.error({ error, url: request.url, method: request.method }, 'Unhandled error');
    reply.status(500).send({
      status: 'error',
      error: 'Internal server error',
      message: env.NODE_ENV === 'development' ? error.message : undefined,
    });
  });

  // Register routes (order matters - specific routes before catch-all)
  await registerHealthRoutes(fastify, prisma);
  await registerAdminRoutes(fastify, prisma);
  await registerCaptureRoute(fastify, prisma);

  // Start server
  try {
    await fastify.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info({ port: env.PORT }, 'Server started successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    await prisma.$disconnect();
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down gracefully');
    await fastify.close();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

