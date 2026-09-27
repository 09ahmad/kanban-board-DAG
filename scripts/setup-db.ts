#!/usr/bin/env bun

/**
 * Database setup script for TaskFlow Pro
 * Run this to set up only the database (PostgreSQL + Prisma + Seed)
 */

import { $ } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const ENV_FILE = resolve(ROOT, ".env");
const ENV_EXAMPLE = resolve(ROOT, ".env.example");

async function main() {
  console.log("🗄️  TaskFlow Pro - Database Setup");
  console.log("==================================\n");

  // 1. Check if .env exists
  if (!existsSync(ENV_FILE)) {
    if (existsSync(ENV_EXAMPLE)) {
      console.log("📝 Creating .env from .env.example...");
      const envExample = readFileSync(ENV_EXAMPLE, "utf-8");
      writeFileSync(ENV_FILE, envExample);
      console.log("✅ .env created. Please edit it with your DATABASE_URL.\n");
    } else {
      console.error("❌ .env.example not found!");
      process.exit(1);
    }
  }

  // 2. Check environment configuration
  console.log("🔍 Checking environment configuration...");
  try {
    await $`bun run check-env`;
    console.log("✅ Environment check passed\n");
  } catch (error) {
    console.error("❌ Environment check failed. Please fix the issues above.");
    process.exit(1);
  }

  // 3. Check if Docker is running for postgres
  console.log("🐳 Checking PostgreSQL via Docker...");
  try {
    await $`docker compose up -d postgres`;
    console.log("✅ PostgreSQL started\n");
    // Wait for PostgreSQL to be ready
    console.log("⏳ Waiting for PostgreSQL to be ready...");
    await new Promise(resolve => setTimeout(resolve, 3000));
  } catch {
    console.log("⚠️  Could not start PostgreSQL via Docker.");
    console.log("   Please ensure PostgreSQL is running at:", process.env.DATABASE_URL || "postgresql://taskflow:taskflow@localhost:5432/taskflow\n");
  }

  // 4. Generate Prisma client
  console.log("🔧 Generating Prisma client...");
  try {
    await $`cd ${ROOT}/packages/db && bunx prisma generate`;
    console.log("✅ Prisma client generated\n");
  } catch (error) {
    console.error("❌ Failed to generate Prisma client:", error);
    process.exit(1);
  }

  // 5. Push database schema
  console.log("📊 Pushing database schema...");
  try {
    await $`cd ${ROOT}/packages/db && bunx prisma db push`;
    console.log("✅ Database schema pushed\n");
  } catch (error) {
    console.error("❌ Failed to push database schema:", error);
    process.exit(1);
  }

  // 6. Seed database
  console.log("🌱 Seeding database with demo data...");
  try {
    console.log("   Running seed script...");
    const result = await $`cd ${ROOT}/packages/db && bun run seed`;
    // Get stdout from ReadableStream
    const stdout = await new Response(result.stdout).text();
    console.log("   Seed output:", stdout.trim() || "(no output)");
    console.log("✅ Database seeded\n");
  } catch (error) {
    console.error("❌ Failed to seed database:", error);
    process.exit(1);
  }

  console.log("\n🎉 Database setup complete!");
  console.log("\n📋 You can now:");
  console.log("   - Run 'bun run db:studio' to open Prisma Studio");
  console.log("   - Run 'bun run start:server' to start the REST API");
  console.log("   - Run 'bun run start:ws' to start the WebSocket server");
}

await main();
