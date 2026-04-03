import type { RedisClient } from "./redis-client.js";
import type { CommandDefinition } from "../engine/types.js";

export type LockMode =
  | "per_command_type"
  | "per_action_type"
  | "visual_audio"
  | "singular"
  | "none";

export class CommandLockService {
  /** Auto-expire safety so stale locks don't persist forever */
  private readonly lockTtl = 30;

  constructor(private readonly redis: RedisClient | null) {}

  async acquire(
    tenantId: string,
    commandType: string,
    definition: CommandDefinition,
    unlocked: boolean,
    lockMode: LockMode,
  ): Promise<{ acquired: boolean; keys: string[] }> {
    if (!this.redis || unlocked || lockMode === "none") {
      return { acquired: true, keys: [] };
    }

    const keys = this.getLockKeys(tenantId, commandType, definition, lockMode);
    if (keys.length === 0) return { acquired: true, keys: [] };

    const acquiredKeys: string[] = [];

    for (const key of keys) {
      const result = await this.redis.set(key, "1", "EX", this.lockTtl, "NX");
      if (!result) {
        // Failed to acquire — release any we already got
        for (const k of acquiredKeys) {
          await this.redis.del(k);
        }
        return { acquired: false, keys: [] };
      }
      acquiredKeys.push(key);
    }

    return { acquired: true, keys: acquiredKeys };
  }

  async release(keys: string[]): Promise<void> {
    if (!this.redis || keys.length === 0) return;

    for (const key of keys) {
      await this.redis.del(key);
    }
  }

  private getLockKeys(
    tenantId: string,
    commandType: string,
    definition: CommandDefinition,
    mode: LockMode,
  ): string[] {
    switch (mode) {
      case "per_command_type":
        return [`lock:${tenantId}:type:${commandType}`];

      case "singular":
        return [`lock:${tenantId}:global`];

      case "per_action_type": {
        const types = new Set(definition.actions?.map((a) => a.type) ?? []);
        return Array.from(types).map((t) => `lock:${tenantId}:action:${t}`);
      }

      case "visual_audio": {
        // These action types may be added later; check by string to be forward-compatible
        const actionTypes = definition.actions?.map((a) => a.type as string) ?? [];
        const hasVisualAudio = actionTypes.some(
          (t) => t === "sound" || t === "overlay",
        );
        return hasVisualAudio ? [`lock:${tenantId}:visual_audio`] : [];
      }

      default:
        return [];
    }
  }
}
