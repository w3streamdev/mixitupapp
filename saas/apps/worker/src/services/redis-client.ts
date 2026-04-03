import { Redis } from "ioredis";

export type RedisClient = Redis;

export function createRedisClient(): Redis | null {
  const url = process.env.REDIS_URL;
  if (!url) {
    console.log("[Redis] REDIS_URL not set — running without Redis");
    return null;
  }

  const client = new Redis(url);
  client.on("connect", () => console.log("[Redis] Connected"));
  client.on("error", (err: Error) => console.error("[Redis] Error:", err.message));
  return client;
}
