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
const WEB_ENV_LOCAL = resolve(ROOT, "apps/web/.env.local");

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

  // 2. Check environment configuration
  console.log("🔍 Checking environment configuration...");
  try {
    await $`bun run check-env`;
    console.log("✅ Environment check passed\n");
  } catch (error) {
    console.error("❌ Environment check failed. Please fix the issues above.");
    process.exit(1);
  }

  // 3. Generate .env.local for web app (Next.js loads this automatically)
  console.log("📝 Generating .env.local for web app...");
  const envContent = readFileSync(ENV_FILE, "utf-8");
  const env = parseEnvFile(envContent);
  const webEnvVars = [
    "NEXT_PUBLIC_API_URL",
    "NEXT_PUBLIC_WS_URL",
  ];
  let webEnvContent = "";
  for (const key of webEnvVars) {
    if (env[key]) {
      webEnvContent += `${key}=${env[key]}\n`;
    }
  }
  // Add defaults if not set
  if (!env["NEXT_PUBLIC_API_URL"]) webEnvContent += "NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1\n";
  if (!env["NEXT_PUBLIC_WS_URL"]) webEnvContent += "NEXT_PUBLIC_WS_URL=ws://localhost:4001\n";
  writeFileSync(WEB_ENV_LOCAL, webEnvContent);
  console.log("✅ .env.local generated for web app\n");

  // 4. Check if Docker is running for postgres/redis
  console.log("🐳 Checking Docker services...");
  let dockerAvailable = false;
  try {
    await $`docker compose ps`;
    console.log("✅ Docker is available\n");
    dockerAvailable = true;
  } catch {
    console.log("⚠️  Docker not running. Starting PostgreSQL and Redis...");
    try {
      await $`docker compose up -d`;
      console.log("✅ Docker services started\n");
      // Wait for services to be ready
      console.log("⏳ Waiting for services to be ready...");
      await new Promise(resolve => setTimeout(resolve, 3000));
      dockerAvailable = true;
    } catch {
      console.log("⚠️  Could not start Docker services. Please ensure PostgreSQL and Redis are running manually.");
      console.log("   PostgreSQL: postgresql://taskflow:taskflow@localhost:5432/taskflow");
      console.log("   Redis: redis://localhost:6379\n");
    }
  }

  if (dockerAvailable) {
    // 5. Generate Prisma client
    console.log("🔧 Generating Prisma client...");
    try {
      await $`cd ${ROOT}/packages/db && bunx prisma generate`;
      console.log("✅ Prisma client generated\n");
    } catch (error) {
      console.error("❌ Failed to generate Prisma client:", error);
      process.exit(1);
    }

    // 6. Push database schema
    console.log("📊 Pushing database schema...");
    try {
      await $`cd ${ROOT}/packages/db && bunx prisma db push`;
      console.log("✅ Database schema pushed\n");
    } catch (error) {
      console.error("❌ Failed to push database schema:", error);
      process.exit(1);
    }

    // 7. Seed database
    console.log("🌱 Seeding database with demo data...");
    try {
      console.log("   Running seed script...");
      const result = await $`cd ${ROOT}/packages/db && bun run seed`;
      const stdout = await new Response(result.stdout).text();
      console.log("   Seed output:", stdout.trim() || "(no output)");
      console.log("✅ Database seeded\n");
    } catch (error) {
      console.error("❌ Failed to seed database:", error);
      process.exit(1);
    }

    // 8. Build all packages
    console.log("🏗️  Building all packages...");
    try {
      await $`cd ${ROOT} && bun run build`;
      console.log("✅ All packages built\n");
    } catch (error) {
      console.error("❌ Build failed:", error);
      process.exit(1);
    }
  } else {
    console.log("⚠️  Skipping database setup and build (Docker not available)");
    console.log("   Run 'bun run setup:db' once Docker is available");
  }

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

function parseEnvFile(content: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx > 0) {
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      env[key] = value;
    }
  }
  return env;
}

await main();
