import { Controller, Get, Param, Post, Body, Logger } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireRoles } from "../../auth/roles.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { MigrationService } from "./migration.service.js";
import { StartMigrationBody } from "./dto/start-migration.body.js";

@ApiTags("Migration")
@Controller("api/v2/migration")
export class MigrationController {
  private readonly logger = new Logger(MigrationController.name);

  constructor(private readonly migrationService: MigrationService) {}

  @Post("import")
  @RequireRoles("owner", "admin")
  async startImport(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: StartMigrationBody,
  ) {
    this.logger.log(`Starting migration import for tenant ${ctx.tenantId}`);
    const job = await this.migrationService.startImport(ctx.tenantId, body);
    return { Job: job };
  }

  @Get("status/:jobId")
  @RequireRoles("owner", "admin")
  async getStatus(
    @TenantContext() ctx: { tenantId: string },
    @Param("jobId") jobId: string,
  ) {
    const status = await this.migrationService.getJobStatus(ctx.tenantId, jobId);
    return { Status: status };
  }

  @Post("reconcile")
  @RequireRoles("owner", "admin")
  async reconcile(@TenantContext() ctx: { tenantId: string }) {
    const result = await this.migrationService.reconcile(ctx.tenantId);
    return { Reconciliation: result };
  }
}
