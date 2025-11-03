import { FastifyRequest } from 'fastify';
import { MultipartFile } from '@fastify/multipart';
import { promises as fs } from 'fs';
import { join } from 'path';
import { ulid } from 'ulid';
import { UploadedFileData } from './types';

export interface MultipartResult {
  files: UploadedFileData[];
  fields: Record<string, string>;
}

/**
 * Saves multipart files to disk and returns metadata
 */
export async function saveMultipartFiles(
  request: FastifyRequest,
  requestId: string,
  uploadDir: string
): Promise<MultipartResult> {
  const files: UploadedFileData[] = [];
  const fields: Record<string, string> = {};

  // Ensure upload directory exists
  const requestDir = join(uploadDir, requestId);
  await fs.mkdir(requestDir, { recursive: true });

  // Process multipart data
  const parts = request.parts();

  for await (const part of parts) {
    if (part.type === 'file') {
      const file = part as MultipartFile;
      const fileId = ulid();
      const filename = file.filename || `file-${fileId}`;
      const diskPath = join(requestDir, filename);

      // Save file to disk
      const chunks: Buffer[] = [];
      for await (const chunk of file) {
        chunks.push(chunk);
      }
      const fileBuffer = Buffer.concat(chunks);
      await fs.writeFile(diskPath, fileBuffer);

      files.push({
        id: fileId,
        requestId,
        fieldName: part.fieldname,
        originalName: filename,
        mimeType: file.mimetype || undefined,
        size: fileBuffer.length,
        diskPath,
      });
    } else {
      // Non-file field
      const chunks: Buffer[] = [];
      for await (const chunk of part) {
        chunks.push(chunk);
      }
      const value = Buffer.concat(chunks).toString('utf8');
      fields[part.fieldname] = value;
    }
  }

  return { files, fields };
}

/**
 * Ensures upload directory exists
 */
export async function ensureUploadDir(uploadDir: string): Promise<void> {
  await fs.mkdir(uploadDir, { recursive: true });
}

