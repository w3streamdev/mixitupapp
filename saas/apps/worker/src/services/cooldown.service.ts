import type { RedisClient } from "./redis-client.js";

export class CooldownService {
  constructor(private readonly redis: RedisClient | null) {}

  async check(
    tenantId: string,
    commandId: string,
    userId: string,
    cooldownSeconds: number,
    userCooldownSeconds: number,
  ): Promise<{ onCooldown: boolean; remaining: number }> {
    if (!this.redis) return { onCooldown: false, remaining: 0 };

    // Check global cooldown
    if (cooldownSeconds > 0) {
      const globalTtl = await this.redis.ttl(`cd:${tenantId}:${commandId}`);
      if (globalTtl > 0) return { onCooldown: true, remaining: globalTtl };
    }

    // Check per-user cooldown
    if (userCooldownSeconds > 0) {
      const userTtl = await this.redis.ttl(
        `cd:${tenantId}:${commandId}:${userId}`,
      );
      if (userTtl > 0) return { onCooldown: true, remaining: userTtl };
    }

    return { onCooldown: false, remaining: 0 };
  }

  async set(
    tenantId: string,
    commandId: string,
    userId: string,
    cooldownSeconds: number,
    userCooldownSeconds: number,
  ): Promise<void> {
    if (!this.redis) return;

    if (cooldownSeconds > 0) {
      await this.redis.setex(`cd:${tenantId}:${commandId}`, cooldownSeconds, "1");
    }
    if (userCooldownSeconds > 0) {
      await this.redis.setex(
        `cd:${tenantId}:${commandId}:${userId}`,
        userCooldownSeconds,
        "1",
      );
    }
  }

  async clear(
    tenantId: string,
    commandId: string,
    userId?: string,
  ): Promise<void> {
    if (!this.redis) return;

    await this.redis.del(`cd:${tenantId}:${commandId}`);
    if (userId) {
      await this.redis.del(`cd:${tenantId}:${commandId}:${userId}`);
    }
  }
}
