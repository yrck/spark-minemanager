# Capture-All API Service

A TypeScript service that captures all HTTP requests sent to `api.mine.7dm.link`, persists full request details to a database, and provides admin endpoints for querying captured data.

## Features

- **Universal Request Capture**: Captures all HTTP methods and paths (GET, POST, PUT, PATCH, DELETE, etc.)
- **Full Request Persistence**: Stores headers, query parameters, body content, IP addresses, and more
- **Multipart File Support**: Handles file uploads, saves files to disk, and tracks metadata
- **Admin API**: Secure endpoints for querying, retrieving, and managing captured requests
- **Health & Metrics**: Health check endpoints and Prometheus-compatible metrics
- **Security**: Header redaction, bearer token authentication for admin routes
- **Docker Ready**: Multi-stage Docker build optimized for production deployment

## Technology Stack

- **Runtime**: Node.js 20
- **Framework**: Fastify
- **Database**: SQLite (dev) / Postgres (prod) via Prisma ORM
- **Language**: TypeScript
- **Logging**: Pino

## Project Structure

```
/app
  /src
    index.ts          # Fastify server bootstrap
    env.ts            # Environment variable validation
    log.ts            # Pino logger configuration
    capture.ts        # Universal catch-all route handler
    admin.ts          # Admin routes with auth
    health.ts         # Health, readiness, and metrics endpoints
    storage.ts        # Multipart file handling
    redact.ts         # Header/body redaction utilities
    types.d.ts        # TypeScript type definitions
  /prisma
    schema.prisma     # Prisma schema
  /scripts
    seed.ts           # Optional seed script
  Dockerfile
  docker-compose.yaml
```

## Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3000` | No |
| `NODE_ENV` | Environment (`development` or `production`) | `development` | No |
| `DATABASE_URL` | Database connection string | - | **Yes** |
| `ADMIN_TOKEN` | Bearer token for admin endpoints | - | **Yes** |
| `MAX_BODY_BYTES` | Maximum request body size in bytes | `10485760` (10 MB) | No |
| `UPLOAD_DIR` | Directory for uploaded files | `/data/uploads` | No |
| `REDACTED_FIELDS` | Comma-separated list of header fields to redact | `authorization,cookie,x-api-key` | No |

### Database URLs

- **SQLite (dev)**: `file:./data/db.sqlite`
- **Postgres (prod)**: `postgresql://user:password@host:5432/dbname`

> **Note**: For Postgres, you'll need to update the `provider` in `prisma/schema.prisma` from `sqlite` to `postgresql` and regenerate the Prisma client.

## Local Development

### Prerequisites

- Node.js 20+
- npm or yarn
- Docker (optional, for containerized development)

### Setup

1. **Clone and install dependencies**:
   ```bash
   npm install
   ```

2. **Create environment file**:
   ```bash
   cp .env.example .env
   # Edit .env with your values
   ```

3. **Initialize database**:
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

4. **Start development server**:
   ```bash
   npm run dev
   ```

The server will start on `http://localhost:3000`.

### Database Management

- **Prisma Studio** (visual database browser):
  ```bash
  npm run prisma:studio
  ```

- **Create a new migration**:
  ```bash
  npx prisma migrate dev --name your_migration_name
  ```

## Docker Development

### Using Docker Compose

**Note**: The `docker-compose.yaml` file is configured for Coolify deployment (no port bindings). For local development, you can either:

1. **Add port mapping manually**:
   ```bash
   docker-compose up --build -p 3000:3000
   ```

2. **Or modify docker-compose.yaml** temporarily to add:
   ```yaml
   ports:
     - "3000:3000"
   ```

```bash
# Build and start
docker-compose up --build

# Run in background
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

### Manual Docker Build

```bash
# Build image
docker build -t capture-all-api .

# Run container
docker run -p 3000:3000 \
  -e DATABASE_URL=file:./data/db.sqlite \
  -e ADMIN_TOKEN=your-secret-token \
  -v $(pwd)/data:/app/data \
  -v $(pwd)/uploads:/data/uploads \
  capture-all-api
```

## Deployment (Coolify)

### Configuration

1. **Port**: Container listens on port `3000` internally (Coolify handles external port mapping)
2. **Volume Mounts**: Configure in Coolify UI:
   - `/data` - For SQLite database and uploads (or use external Postgres)
   - `/data/uploads` - For uploaded files

3. **Environment Variables**: Set all required variables in Coolify UI

4. **Health Check**: The container includes a healthcheck for `/healthz`

### Deployment Steps

1. Connect your repository to Coolify
2. **Important**: Coolify will use the Dockerfile - it will generate its own docker-compose.yaml
3. Set environment variables in Coolify UI:
   - `DATABASE_URL` (Postgres connection string for production, or SQLite path)
   - `ADMIN_TOKEN` (strong, random token)
   - `NODE_ENV=production`
   - `PORT=3000` (container internal port)
   - `UPLOAD_DIR=/data/uploads`
4. Configure volumes in Coolify for persistent data storage
5. Coolify will:
   - Build the Docker image using the Dockerfile
   - Run Prisma migrations on startup (via CMD)
   - Start the service on port 3000 inside container
   - Handle HTTPS termination and domain routing automatically

### Database Migration

The Dockerfile runs `prisma migrate deploy` on container startup, which applies pending migrations. For production:

- Ensure your Postgres database is accessible
- Update `prisma/schema.prisma` provider to `postgresql` if using Postgres
- Run migrations manually if needed:
  ```bash
  docker exec <container> npx prisma migrate deploy
  ```

## API Endpoints

### Capture Endpoint

All requests to any path (except `/admin/*`, `/healthz`, `/readyz`, `/metrics`) are captured:

```bash
# Any method, any path
curl -X POST https://api.mine.7dm.link/rebuild/users?stage=beta \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@b.com","roles":["admin"]}'

# Response:
# {"status":"ok","request_id":"01ARZ3NDEKTSV4RRFFQ69G5FAV"}
```

### Health Endpoints

- **GET /healthz**: Health check
  ```bash
  curl https://api.mine.7dm.link/healthz
  # {"ok":true,"db":"up","version":"1.0.0"}
  ```

- **GET /readyz**: Readiness check (verifies DB is writable)
  ```bash
  curl https://api.mine.7dm.link/readyz
  # {"ok":true,"message":"Service is ready"}
  ```

- **GET /metrics**: Prometheus-compatible metrics
  ```bash
  curl https://api.mine.7dm.link/metrics
  # total_captured 42
  # captured_by_method{method="POST"} 15
  # ...
  ```

### Admin Endpoints

All admin endpoints require `Authorization: Bearer <ADMIN_TOKEN>` header.

#### List Requests

```bash
curl 'https://api.mine.7dm.link/admin/requests?limit=50&offset=0&method=POST' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

**Query Parameters**:
- `limit` (default: 50): Number of results per page
- `offset` (default: 0): Pagination offset
- `method`: Filter by HTTP method (GET, POST, etc.)
- `pathPrefix`: Filter by path prefix (e.g., `/api/users`)
- `since`: ISO8601 timestamp (filter requests after this time)
- `until`: ISO8601 timestamp (filter requests before this time)
- `hasFiles`: Filter by presence of files (`true`/`false`)

#### Get Request by ID

```bash
curl 'https://api.mine.7dm.link/admin/requests/01ARZ3NDEKTSV4RRFFQ69G5FAV' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

Returns full request details including headers, query, and body (body is base64-encoded if non-UTF8).

#### List Files for Request

```bash
curl 'https://api.mine.7dm.link/admin/requests/01ARZ3NDEKTSV4RRFFQ69G5FAV/files' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

#### Download File

```bash
curl 'https://api.mine.7dm.link/admin/files/01ARZ3NDEKTSV4RRFFQ69G5FAV' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN' \
  -o downloaded-file.txt
```

#### Delete Request (Soft Delete)

```bash
curl -X DELETE 'https://api.mine.7dm.link/admin/requests/01ARZ3NDEKTSV4RRFFQ69G5FAV' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

#### Delete Requests Older Than N Days

```bash
curl -X DELETE 'https://api.mine.7dm.link/admin/older-than?days=30' \
  -H 'Authorization: Bearer YOUR_ADMIN_TOKEN'
```

## Manual Test Plan

After deployment, test the service with these commands:

```bash
# 1) Health check
curl -s https://api.mine.7dm.link/healthz

# 2) Capture JSON POST request
curl -s -X POST 'https://api.mine.7dm.link/rebuild/users?stage=beta' \
  -H 'Content-Type: application/json' \
  -d '{"email":"a@b.com","roles":["admin"]}'

# 3) Capture multipart upload
curl -s -X POST 'https://api.mine.7dm.link/upload' \
  -F 'file1=@/etc/hosts' \
  -F 'note=hello'

# 4) List captured requests (replace YOUR_TOKEN)
curl -s 'https://api.mine.7dm.link/admin/requests?limit=5' \
  -H 'Authorization: Bearer YOUR_TOKEN'

# 5) Get specific request (replace IDs)
curl -s 'https://api.mine.7dm.link/admin/requests/<request_id>' \
  -H 'Authorization: Bearer YOUR_TOKEN'
```

## Testing

Run unit tests:

```bash
npm test
```

Test files are in `src/__tests__/`:
- `capture.test.ts`: Tests for capture route handler
- `admin.test.ts`: Tests for admin authentication

## Data Model

### CapturedRequest

- `id`: ULID (primary key)
- `ts`: Timestamp (UTC)
- `ip`: Client IP address
- `method`: HTTP method
- `path`: Request path
- `query`: Query parameters (JSON)
- `headers`: Request headers (JSON, with redactions)
- `contentType`: Content-Type header
- `contentLength`: Content-Length header
- `rawBodyBytes`: Request body (binary)
- `rawBodyEncoding`: Encoding (`utf8` or `base64`)
- `truncated`: Whether body was truncated
- `hasFiles`: Whether request contained files
- `deletedAt`: Soft delete timestamp

### UploadedFile

- `id`: ULID (primary key)
- `requestId`: Foreign key to CapturedRequest
- `fieldName`: Form field name
- `originalName`: Original filename
- `mimeType`: MIME type
- `size`: File size in bytes
- `diskPath`: Path to file on disk

## Security Considerations

1. **Admin Token**: Use a strong, random token in production
2. **Header Redaction**: Sensitive headers (authorization, cookie, etc.) are automatically redacted
3. **CORS**: Configured to allow all origins for capture routes (adjust if needed)
4. **Body Size Limits**: Enforced via `MAX_BODY_BYTES` (default 10MB)
5. **Soft Deletes**: Deleted requests are marked, not permanently removed

## Troubleshooting

### Database Connection Issues

- Verify `DATABASE_URL` is correct
- For Postgres, ensure the database exists and is accessible
- Check network connectivity and firewall rules

### File Upload Issues

- Verify `UPLOAD_DIR` exists and is writable
- Check disk space
- Ensure volume mounts are correct in Docker

### Migration Issues

- Run `npx prisma migrate reset` to reset the database (dev only)
- Check Prisma logs for specific errors
- Ensure `DATABASE_URL` matches the provider in `schema.prisma`

## License

ISC

