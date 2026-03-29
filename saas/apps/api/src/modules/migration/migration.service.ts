import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

interface MigrationJob {
  id: string;
  tenantId: string;
  status: "pending" | "running" | "completed" | "failed";
  entitiesProcessed: number;
  entitiesTotal: number;
  errors: string[];
  startedAt: Date;
  completedAt: Date | null;
}

interface DesktopExportData {
  commands?: DesktopCommand[];
  counters?: DesktopCounter[];
  currencies?: DesktopCurrency[];
  users?: DesktopUser[];
}

interface DesktopCommand {
  ID: string;
  Name: string;
  Type: string;
  IsEnabled: boolean;
  Unlocked: boolean;
  GroupName?: string;
  Definition?: Record<string, unknown>;
}

interface DesktopCounter {
  Name: string;
  Amount: number;
  ResetAmount: number;
}

interface DesktopCurrency {
  Name: string;
  AcquireAmount: number;
  AcquireInterval: number;
  MaxAmount: number;
}

interface DesktopUser {
  Platform: string;
  PlatformID?: string;
  Username?: string;
  DisplayName?: string;
  OnlineViewingMinutes?: number;
  CustomTitle?: string;
  Notes?: string;
}

@Injectable()
export class MigrationService {
  private readonly logger = new Logger(MigrationService.name);
  private readonly jobs = new Map<string, MigrationJob>();

  constructor(private readonly prisma: PrismaService) {}

  async startImport(
    tenantId: string,
    body: { data: DesktopExportData },
  ): Promise<MigrationJob> {
    const jobId = crypto.randomUUID();
    const data = body.data;

    const totalEntities =
      (data.commands?.length ?? 0) +
      (data.counters?.length ?? 0) +
      (data.currencies?.length ?? 0) +
      (data.users?.length ?? 0);

    const job: MigrationJob = {
      id: jobId,
      tenantId,
      status: "running",
      entitiesProcessed: 0,
      entitiesTotal: totalEntities,
      errors: [],
      startedAt: new Date(),
      completedAt: null,
    };
    this.jobs.set(`${tenantId}:${jobId}`, job);

    // Run import asynchronously
    void this.runImport(job, data);

    return job;
  }

  private async runImport(job: MigrationJob, data: DesktopExportData): Promise<void> {
    try {
      // Import commands
      if (data.commands) {
        for (const cmd of data.commands) {
          try {
            await this.prisma.command.create({
              data: {
                tenantId: job.tenantId,
                name: cmd.Name,
                type: cmd.Type,
                isEnabled: cmd.IsEnabled,
                unlocked: cmd.Unlocked,
                groupName: cmd.GroupName ?? null,
                definition: (cmd.Definition ?? {}) as Record<string, never>,
              },
            });
            job.entitiesProcessed++;
          } catch (err) {
            job.errors.push(
              `Command '${cmd.Name}': ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }
      }

      // Import counters
      if (data.counters) {
        for (const counter of data.counters) {
          try {
            await this.prisma.counter.create({
              data: {
                tenantId: job.tenantId,
                name: counter.Name,
                amount: counter.Amount,
                resetAmount: counter.ResetAmount,
              },
            });
            job.entitiesProcessed++;
          } catch (err) {
            job.errors.push(
              `Counter '${counter.Name}': ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }
      }

      // Import currencies
      if (data.currencies) {
        for (const currency of data.currencies) {
          try {
            await this.prisma.currency.create({
              data: {
                tenantId: job.tenantId,
                name: currency.Name,
                acquireAmount: currency.AcquireAmount,
                acquireInterval: currency.AcquireInterval,
                maxAmount: currency.MaxAmount,
              },
            });
            job.entitiesProcessed++;
          } catch (err) {
            job.errors.push(
              `Currency '${currency.Name}': ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }
      }

      // Import users
      if (data.users) {
        for (const user of data.users) {
          try {
            await this.prisma.tenantUser.create({
              data: {
                tenantId: job.tenantId,
                platform: user.Platform,
                platformUserId: user.PlatformID ?? null,
                username: user.Username ?? null,
                displayName: user.DisplayName ?? user.Username ?? null,
                onlineViewingMinutes: user.OnlineViewingMinutes ?? 0,
                customTitle: user.CustomTitle ?? null,
                notes: user.Notes ?? null,
              },
            });
            job.entitiesProcessed++;
          } catch (err) {
            job.errors.push(
              `User '${user.Username ?? user.PlatformID}': ${err instanceof Error ? err.message : "Unknown error"}`,
            );
          }
        }
      }

      job.status = job.errors.length > 0 ? "completed" : "completed";
      job.completedAt = new Date();
      this.logger.log(
        `Migration ${job.id} completed: ${job.entitiesProcessed}/${job.entitiesTotal} entities, ${job.errors.length} errors`,
      );
    } catch (err) {
      job.status = "failed";
      job.completedAt = new Date();
      job.errors.push(err instanceof Error ? err.message : "Unknown fatal error");
      this.logger.error(`Migration ${job.id} failed`, err instanceof Error ? err.stack : err);
    }
  }

  async getJobStatus(tenantId: string, jobId: string): Promise<MigrationJob> {
    const job = this.jobs.get(`${tenantId}:${jobId}`);
    if (!job) throw new NotFoundException(`Migration job '${jobId}' not found`);
    return job;
  }

  async reconcile(tenantId: string) {
    const [commands, counters, currencies, users] = await Promise.all([
      this.prisma.command.count({ where: { tenantId } }),
      this.prisma.counter.count({ where: { tenantId } }),
      this.prisma.currency.count({ where: { tenantId } }),
      this.prisma.tenantUser.count({ where: { tenantId } }),
    ]);

    return {
      tenantId,
      counts: { commands, counters, currencies, users },
      timestamp: new Date().toISOString(),
    };
  }
}
