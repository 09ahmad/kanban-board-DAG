#!/usr/bin/env bun

/**
 * Start all services script for TaskFlow Pro
 * Starts PostgreSQL, Redis, REST API server, and WebSocket server
 */

import { $ } from "bun";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");

async function main() {
  console.log("🚀 TaskFlow Pro - Starting All Services");
  console.log("========================================\n");

  // 1. Start Docker services (PostgreSQL + Redis)
  console.log("🐳 Starting Docker services (PostgreSQL + Redis)...");
  try {
    await $`docker compose up -d`;
    console.log("✅ Docker services started\n");
    // Wait for services to be ready
    console.log("⏳ Waiting for services to be ready...");
    await new Promise(resolve => setTimeout(resolve, 5000));
  } catch (error) {
    console.error("❌ Failed to start Docker services:", error);
    console.log("   Please ensure Docker is running and try again.\n");
    process.exit(1);
  }

  // 2. Check environment
  console.log("🔍 Checking environment configuration...");
  try {
    await $`bun run check-env`;
  } catch {
    console.log("⚠️  Environment check had warnings (see above)\n");
  }

  // 3. Start all services using turbo
  console.log("🚀 Starting REST API (port 4000) and WebSocket server (port 4001)...");
  console.log("   Press Ctrl+C to stop all services\n");

  // Start both servers in parallel using turbo
  // We use a single turbo command with persistent dev tasks
  try {
    await $`bun run dev`;
  } catch (error) {
    // Turbo dev runs persistently, so this is expected when user presses Ctrl+C
    console.log("\n👋 All services stopped");
  }
}

await main();