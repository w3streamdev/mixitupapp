import type { OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<string>;
  setex(key: string, seconds: number, value: string): Promise<string>;
  del(...keys: string[]): Promise<number>;
  exists(...keys: string[]): Promise<number>;
  quit(): Promise<string>;
}

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private client: RedisClient | null = null;

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) {
      this.logger.warn("REDIS_URL not set — Redis operations will be no-ops");
      return;
    }

    try {
      const mod = await import("ioredis" as string);
      const Redis = mod.default ?? mod;
      this.client = new Redis(redisUrl) as RedisClient;
      this.logger.log("Redis client connected");
    } catch {
      this.logger.warn("ioredis not available — Redis operations will be no-ops");
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
  }

  async get(key: string): Promise<string | null> {
    if (!this.client) {
      this.logger.warn(`Redis not connected — returning null for key ${key}`);
      return null;
    }
    return this.client.get(key);
  }

  async set(key: string, value: string): Promise<string | null> {
    if (!this.client) {
      this.logger.warn(`Redis not connected — dropping set for key ${key}`);
      return null;
    }
    return this.client.set(key, value);
  }

  async setEx(key: string, seconds: number, value: string): Promise<string | null> {
    if (!this.client) {
      this.logger.warn(`Redis not connected — dropping setEx for key ${key}`);
      return null;
    }
    return this.client.setex(key, seconds, value);
  }

  async del(...keys: string[]): Promise<number> {
    if (!this.client) {
      this.logger.warn("Redis not connected — dropping del");
      return 0;
    }
    return this.client.del(...keys);
  }

  async exists(...keys: string[]): Promise<boolean> {
    if (!this.client) {
      this.logger.warn("Redis not connected — returning false for exists");
      return false;
    }
    const count = await this.client.exists(...keys);
    return count > 0;
  }
}
