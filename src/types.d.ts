// Type definitions for the application

export interface CapturedRequestData {
  id: string;
  ip?: string;
  method: string;
  path: string;
  query: Record<string, unknown>;
  headers: Record<string, string>;
  contentType?: string;
  contentLength?: number;
  rawBodyBytes?: Buffer;
  rawBodyEncoding?: string;
  truncated: boolean;
  hasFiles: boolean;
}

export interface UploadedFileData {
  id: string;
  requestId: string;
  fieldName: string;
  originalName: string;
  mimeType: string | null;
  size: number;
  diskPath: string;
}

