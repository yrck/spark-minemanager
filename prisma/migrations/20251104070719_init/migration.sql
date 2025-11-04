-- CreateTable
CREATE TABLE "captured_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ts" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query" TEXT NOT NULL DEFAULT '{}',
    "headers" TEXT NOT NULL DEFAULT '{}',
    "content_type" TEXT,
    "content_length" INTEGER,
    "raw_body_bytes" BLOB,
    "raw_body_encoding" TEXT,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "has_files" BOOLEAN NOT NULL DEFAULT false,
    "deleted_at" DATETIME
);

-- CreateTable
CREATE TABLE "uploaded_files" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "request_id" TEXT NOT NULL,
    "field_name" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "mime_type" TEXT,
    "size" INTEGER NOT NULL,
    "disk_path" TEXT NOT NULL,
    CONSTRAINT "uploaded_files_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "captured_requests" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "captured_requests_ts_path_idx" ON "captured_requests"("ts", "path");

-- CreateIndex
CREATE INDEX "captured_requests_path_method_ts_idx" ON "captured_requests"("path", "method", "ts" DESC);

-- CreateIndex
CREATE INDEX "uploaded_files_request_id_idx" ON "uploaded_files"("request_id");
