#!/usr/bin/env bun

/**
 * Environment variable checker for TaskFlow Pro
 * Validates required and optional environment variables
 */

import { readFileSync } from "fs";
import { resolve } from "path";

const ROOT = resolve(import.meta.dir, "..");
const ENV_FILE = resolve(ROOT, ".env");

interface EnvVar {
  name: string;
  required: boolean;
  description: string;
  defaultValue?: string;
}

const ENV_VARS: EnvVar[] = [
  {
    name: "DATABASE_URL",
    required: true,
    description: "PostgreSQL connection string",
    defaultValue: "postgresql://taskflow:taskflow@localhost:5432/taskflow"
  },
  {
    name: "REDIS_URL",
    required: true,
    description: "Redis connection string",
    defaultValue: "redis://localhost:6379"
  },
  {
    name: "PORT",
    required: false,
    description: "REST API server port",
    defaultValue: "4000"
  },
  {
    name: "WS_PORT",
    required: false,
    description: "WebSocket server port",
    defaultValue: "4001"
  },
  {
    name: "NODE_ENV",
    required: false,
    description: "Node environment",
    defaultValue: "development"
  },
  {
    name: "JWT_SECRET",
    required: true,
    description: "JWT signing secret (min 32 chars for production)",
    defaultValue: "change-me-in-production-min-32-chars"
  },
  {
    name: "CORS_ORIGIN",
    required: false,
    description: "CORS origin for frontend",
    defaultValue: "http://localhost:3000"
  },
  {
    name: "LLM_API_KEY",
    required: false,
    description: "OpenAI API key for AI suggestions (optional)",
    defaultValue: ""
  },
  {
    name: "LLM_BASE_URL",
    required: false,
    description: "LLM API base URL",
    defaultValue: "https://api.openai.com/v1"
  },
  {
    name: "LLM_MODEL",
    required: false,
    description: "LLM model to use",
    defaultValue: "gpt-4o-mini"
  },
];

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

function main() {
  console.log("🔍 TaskFlow Pro - Environment Check");
  console.log("====================================\n");

  if (!require("fs").existsSync(ENV_FILE)) {
    console.log("❌ .env file not found! Run 'bun run setup' first.");
    process.exit(1);
  }

  const envContent = readFileSync(ENV_FILE, "utf-8");
  const env = parseEnvFile(envContent);

  let hasErrors = false;
  let hasWarnings = false;

  for (const variable of ENV_VARS) {
    const value = env[variable.name] || process.env[variable.name];
    const isSet = value !== undefined && value !== "";
    const isDefault = variable.defaultValue && value === variable.defaultValue;

    if (variable.required && !isSet) {
      console.log(`❌ ${variable.name} - REQUIRED but not set`);
      console.log(`   ${variable.description}`);
      hasErrors = true;
    } else if (variable.required && isDefault) {
      console.log(`⚠️  ${variable.name} - Set to default value (change for production!)`);
      console.log(`   ${variable.description}`);
      hasWarnings = true;
    } else if (!variable.required && !isSet) {
      console.log(`ℹ️  ${variable.name} - Optional, not set (using default: ${variable.defaultValue || "none"})`);
      console.log(`   ${variable.description}`);
      if (variable.name === "LLM_API_KEY") {
        console.log(`   ⚠️  AI suggestions will be disabled. Add LLM_API_KEY to enable AI features.`);
        hasWarnings = true;
      }
    } else {
      const displayValue = variable.name.includes("SECRET") || variable.name.includes("KEY")
        ? "***hidden***"
        : value;
      console.log(`✅ ${variable.name} = ${displayValue}`);
    }
  }

  console.log("\n📋 Summary:");
  if (hasErrors) {
    console.log("❌ Errors found - fix required variables before starting services");
    process.exit(1);
  } else if (hasWarnings) {
    console.log("⚠️  Warnings found - services will start but some features may be limited");
  } else {
    console.log("✅ All environment variables configured correctly");
  }
}

await main();
