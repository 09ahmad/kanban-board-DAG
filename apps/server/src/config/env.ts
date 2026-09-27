import dotenv from "dotenv";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { SignOptions } from "jsonwebtoken";

const here = fileURLToPath(new URL(".", import.meta.url));
const envPath = resolve(here, "../../../../.env");
const result = dotenv.config({ path: envPath, override: true });
const parsed = result.parsed || {};

for (const [key, value] of Object.entries(parsed)) {
  process.env[key] = value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * How long a login stays valid.
 *
 * There is no refresh token, so this value is the whole session: when it lapses
 * the user signs in again. Thirty days suits a board that people leave open for
 * weeks, and it is configurable so a stricter deployment can shorten it without
 * a code change. Accepts what jsonwebtoken accepts — a number of seconds, or a
 * duration such as `12h` or `30d`.
 */
export function resolveJwtExpiresIn(raw: string | undefined): SignOptions["expiresIn"] {
  // jsonwebtoken types the lifetime as a fixed set of duration literals. This one
  // comes from the environment, so the cast belongs here at the boundary rather
  // than at each call site. A value jsonwebtoken cannot parse is rejected by
  // jwt.sign at the first login rather than at boot.
  return (raw?.trim() || "30d") as SignOptions["expiresIn"];
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: resolveJwtExpiresIn(process.env.JWT_EXPIRES_IN),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:3000",
  redisUrl: process.env.REDIS_URL ?? "redis://localhost:6379",
  databaseUrl: required("DATABASE_URL"),
  llm: {
    apiKey: process.env.LLM_API_KEY ?? "",
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.openai.com/v1",
    model: process.env.LLM_MODEL ?? "gpt-4o-mini",
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS ?? 15000),
  },
};
