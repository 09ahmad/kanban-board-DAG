#!/bin/sh
set -e

echo "Waiting for PostgreSQL..."
until pg_isready -h "$DATABASE_HOST" -p "$DATABASE_PORT" -U "$DATABASE_USER"; do
  sleep 2
done

echo "PostgreSQL is ready. Running migrations..."
cd /app/packages/db
bunx prisma migrate deploy

echo "Seeding database..."
cd /app/packages/db
bun run seed

echo "Database initialization complete!"
