import { Redis } from "ioredis";

function createConnection(): Redis {
  const url = process.env.REDIS_URL ?? "redis://localhost:6379";
  return new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });
}

export const redisPublisher = createConnection();
export const redisSubscriber = createConnection();
export const redis = createConnection();
