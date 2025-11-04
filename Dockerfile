# Multi-stage build for capture-all API service

# Build stage
FROM node:20-alpine AS builder

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl1.1-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Install dependencies
# Use npm install if lockfile doesn't exist, otherwise use npm ci for faster, reliable builds
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Generate Prisma Client
ENV DATABASE_URL="file:./dev.db"
RUN npx prisma generate

# Copy source code
COPY tsconfig.json ./
COPY src ./src

# Build TypeScript
RUN npm run build

# Runtime stage
FROM node:20-alpine

# Install OpenSSL for Prisma migrations
RUN apk add --no-cache openssl1.1-compat

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Copy Prisma schema (needed for Prisma Client)
COPY --from=builder /app/prisma ./prisma

# Install production dependencies
# Prisma is now in dependencies, so it will be installed
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# Copy Prisma generated client from builder
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy built application
COPY --from=builder /app/dist ./dist

# Create data directory for uploads and SQLite
RUN mkdir -p /data/uploads

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:3000/healthz', (r) => { process.exit(r.statusCode === 200 ? 0 : 1) })"

# Run migrations and start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]

