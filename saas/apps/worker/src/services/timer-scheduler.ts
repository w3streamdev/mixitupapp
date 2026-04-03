import type { PrismaClient } from "@prisma/client";

interface TimerConfig {
  intervalSeconds: number;
  minChatMessages: number;
  groupName?: string;
  groupIntervalSeconds?: number;
}

interface TimerDefinition {
  triggers?: never[];
  requirements?: { roles?: string[]; cooldownSeconds?: number; userCooldownSeconds?: number };
  actions: unknown[];
  timer?: TimerConfig;
}

interface PerTenantState {
  lastFiredAt: number;
  messagesSinceFire: number;
  groupIndex: Record<string, number>;
  groupLastFired: Record<string, number>;
}

type CommandRow = {
  id: string;
  tenantId: string;
  definition: unknown;
};

const DEFAULT_INTERVAL_SECONDS = 60;
const DEFAULT_MIN_MESSAGES = 0;

export class TimerScheduler {
  private intervalHandle: ReturnType<typeof setInterval> | null = null;
  private state: Map<string, PerTenantState> = new Map();
  private chatMessageCounts: Map<string, number> = new Map();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly onTimerFire: (tenantId: string, commandId: string) => Promise<void>,
  ) {}

  start(checkIntervalMs = 15_000): void {
    this.intervalHandle = setInterval(() => void this.tick(), checkIntervalMs);
    console.log(`[TimerScheduler] Started, checking every ${checkIntervalMs}ms`);
  }

  stop(): void {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }
    console.log("[TimerScheduler] Stopped");
  }

  /** Call this whenever a chat message is received for a tenant. */
  incrementChatMessages(tenantId: string): void {
    this.chatMessageCounts.set(tenantId, (this.chatMessageCounts.get(tenantId) ?? 0) + 1);
  }

  private getOrCreateState(tenantId: string): PerTenantState {
    let state = this.state.get(tenantId);
    if (!state) {
      state = { lastFiredAt: 0, messagesSinceFire: 0, groupIndex: {}, groupLastFired: {} };
      this.state.set(tenantId, state);
    }
    return state;
  }

  private async tick(): Promise<void> {
    try {
      const timers = await this.prisma.command.findMany({
        where: { type: "timer", isEnabled: true },
        orderBy: { id: "asc" },
      });

      // Group by tenant
      const byTenant = new Map<string, CommandRow[]>();
      for (const t of timers) {
        const list = byTenant.get(t.tenantId) ?? [];
        list.push(t);
        byTenant.set(t.tenantId, list);
      }

      const now = Date.now();

      for (const [tenantId, commands] of byTenant) {
        const state = this.getOrCreateState(tenantId);

        // Accumulate chat messages since last tick
        const newMessages = this.chatMessageCounts.get(tenantId) ?? 0;
        state.messagesSinceFire += newMessages;
        this.chatMessageCounts.set(tenantId, 0);

        // Separate into grouped (with own interval) and ungrouped / default-grouped
        const ungrouped: CommandRow[] = [];
        const namedGroups = new Map<string, CommandRow[]>();

        for (const cmd of commands) {
          const def = cmd.definition as unknown as TimerDefinition;
          const groupName = def.timer?.groupName;
          if (groupName) {
            const g = namedGroups.get(groupName) ?? [];
            g.push(cmd);
            namedGroups.set(groupName, g);
          } else {
            ungrouped.push(cmd);
          }
        }

        // Named groups without their own interval merge into the mega-group
        const megaGroup: CommandRow[] = [...ungrouped];
        const independentGroups = new Map<string, CommandRow[]>();

        for (const [groupName, groupCmds] of namedGroups) {
          const firstDef = groupCmds[0]?.definition as unknown as TimerDefinition;
          if (firstDef?.timer?.groupIntervalSeconds) {
            independentGroups.set(groupName, groupCmds);
          } else {
            megaGroup.push(...groupCmds);
          }
        }

        // Fire one from the mega-group (round-robin) if interval and message requirements are met
        if (megaGroup.length > 0) {
          const interval = DEFAULT_INTERVAL_SECONDS;
          const minMessages = DEFAULT_MIN_MESSAGES;
          const elapsed = (now - state.lastFiredAt) / 1000;

          if (elapsed >= interval && state.messagesSinceFire >= minMessages) {
            const idx = (state.groupIndex["__mega__"] ?? 0) % megaGroup.length;
            const cmd = megaGroup[idx]!;
            await this.onTimerFire(tenantId, cmd.id);
            state.lastFiredAt = now;
            state.messagesSinceFire = 0;
            state.groupIndex["__mega__"] = idx + 1;
          }
        }

        // Fire from independent groups (each has its own interval)
        for (const [groupName, groupCmds] of independentGroups) {
          const firstDef = groupCmds[0]?.definition as unknown as TimerDefinition;
          const interval = firstDef?.timer?.groupIntervalSeconds ?? DEFAULT_INTERVAL_SECONDS;
          const lastFired = state.groupLastFired[groupName] ?? 0;
          const elapsed = (now - lastFired) / 1000;

          if (elapsed >= interval) {
            const idx = (state.groupIndex[groupName] ?? 0) % groupCmds.length;
            const cmd = groupCmds[idx]!;
            await this.onTimerFire(tenantId, cmd.id);
            state.groupIndex[groupName] = idx + 1;
            state.groupLastFired[groupName] = now;
          }
        }
      }
    } catch (err) {
      console.error("[TimerScheduler] Error during tick:", err);
    }
  }
}
