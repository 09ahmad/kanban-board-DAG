import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "./generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";

// 1. Try default cwd .env
dotenv.config();

// 2. If DATABASE_URL is still missing, attempt to load root .env relative to this file
if (!process.env.DATABASE_URL) {
  const here = fileURLToPath(new URL(".", import.meta.url));
  const rootEnv = resolve(here, "../../../.env");
  dotenv.config({ path: rootEnv, override: true });
}

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is not defined");
}

const adapter = new PrismaPg({
    connectionString
});

export const prisma = new PrismaClient({adapter})
