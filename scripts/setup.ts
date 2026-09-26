#!/usr/bin/env bun

/**
 * Main setup script for TaskFlow Pro
 * Run this after `bun install` to set up the entire project
 */

import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const ENV_FILE = resolve(ROOT, ".env");
const ENV_EXAMPLE = resolve(ROOT, ".env.example");

async function main() {
  console.log("🚀 TaskFlow Pro - Project Setup");
  console.log("=================================\n");

  // 1. Check if .env exists, if not create from example
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      console.log("📝 Creating .env from .env.example...");
      const envExample = readFileSync(ENV_EXAMPLE, "utf-8");
      writeFileSync(ENV_FILE, envExample);
      console.log("✅ .env created. Please edit it with your configuration.\n");
    } else {
      console.error("❌ .env.example not found!");
      process.exit(1);
    }
  } else {
    console.log("✅ .env already exists\n");
  }

  // 2. Check if Docker is running for postgres/redis
  console.log("🐳 Checking Docker services...");
  try {
    await $`docker compose ps`;
    console.log("✅ Docker is available\n");
  } catch {
    console.log("⚠️  Docker not running. Starting PostgreSQL and Redis...");
    try {
      await $`docker compose up -d`;
      console.log("✅ Docker services started\n");
      // Wait for services to be ready
      console.log("⏳ Waiting for services to be ready...");
      await new Promise(resolve => setTimeout(resolve, 3000));
    } catch {
      console.log("⚠️  Could not start Docker services. Please ensure PostgreSQL and Redis are running manually.");
      console.log("   PostgreSQL: postgresql://taskflow:taskflow@localhost:5432/taskflow");
      console.log("   Redis: redis://localhost:6379\n");
    }
  }

  // 3. Generate Prisma client
  console.log("🔧 Generating Prisma client...");
  try {
    await $`cd ${ROOT}/packages/db && bunx prisma generate`;
    console.log("✅ Prisma client generated\n");
  } catch (error) {
    console.error("❌ Failed to generate Prisma client:", error);
    process.exit(1);
  }

  // 4. Push database schema
  console.log("📊 Pushing database schema...");
  try {
    await $`cd ${ROOT}/packages/db && bunx prisma db push`;
    console.log("✅ Database schema pushed\n");
  } catch (error) {
    console.error("❌ Failed to push database schema:", error);
    process.exit(1);
  }

  // 5. Seed database
  console.log("🌱 Seeding database with demo data...");
  try {
    await $`cd ${ROOT}/packages/db && bun run seed`;
    console.log("✅ Database seeded\n");
  } catch (error) {
    console.error("❌ Failed to seed database:", error);
    process.exit(1);
  }

  // 6. Build all packages
  console.log("🏗️  Building all packages...");
  try {
    await $`cd ${ROOT} && bun run build`;
    console.log("✅ All packages built\n");
  } catch (error) {
    console.error("❌ Build failed:", error);
    process.exit(1);
  }

  // 7. Check environment variables
  console.log("🔍 Checking environment configuration...");
  await $`cd ${ROOT} && bun run check-env`;

  console.log("\n🎉 Setup complete!");
  console.log("\n📋 Next steps:");
  console.log("   1. Edit .env with your configuration (JWT_SECRET, LLM_API_KEY, etc.)");
  console.log("   2. Run 'bun run start' to start all services");
  console.log("   3. Run 'bun run test:all' to run all tests");
  console.log("\n🔗 Services will be available at:");
  console.log("   - REST API: http://localhost:4000");
  console.log("   - WebSocket: ws://localhost:4001");
  console.log("   - Frontend: http://localhost:3000 (run 'bun run start:web' separately)");
}

await main();