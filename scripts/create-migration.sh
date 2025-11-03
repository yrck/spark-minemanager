#!/bin/bash
# Helper script to create Prisma migrations

echo "Creating Prisma migration..."
npx prisma migrate dev --name init

echo "Migration created successfully!"

