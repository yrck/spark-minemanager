import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FastifyInstance } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { registerCaptureRoute } from '../capture';

// Mock dependencies
vi.mock('../env');
vi.mock('../log');
vi.mock('../health');
vi.mock('../redact');
vi.mock('../storage');

describe('Capture Route', () => {
  let fastify: FastifyInstance;
  let prisma: PrismaClient;

  beforeEach(() => {
    // Setup mock fastify instance
    fastify = {
      all: vi.fn(),
    } as unknown as FastifyInstance;

    // Setup mock prisma
    prisma = {
      capturedRequest: {
        create: vi.fn(),
      },
      uploadedFile: {
        createMany: vi.fn(),
      },
    } as unknown as PrismaClient;
  });

  it('should register the catch-all route', async () => {
    await registerCaptureRoute(fastify, prisma);
    expect(fastify.all).toHaveBeenCalledWith('/*', expect.any(Function));
  });

  // Note: More comprehensive tests would require a full Fastify test setup
  // This is a basic structure that can be expanded
});

