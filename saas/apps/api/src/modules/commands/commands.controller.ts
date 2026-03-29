import { Body, Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { CommandsService } from "./commands.service.js";
import { GetListCommandsQuery } from "./dto/get-list-commands.query.js";
import { RunCommandBody } from "./dto/run-command.body.js";

interface CommandRow {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  unlocked: boolean;
  groupName: string | null;
}

@ApiTags("Commands")
@Controller("api/v2/commands")
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  @Get(":commandId")
  @RequireScopes("commands:read")
  async getById(
    @TenantContext() ctx: { tenantId: string },
    @Param("commandId") commandId: string,
  ) {
    const command = await this.commandsService.getById(ctx.tenantId, commandId);
    return { Command: this.toContract(command) };
  }

  @Get()
  @RequireScopes("commands:read")
  async list(@TenantContext() ctx: { tenantId: string }, @Query() query: GetListCommandsQuery) {
    const result = await this.commandsService.list(ctx.tenantId, query.skip, query.pageSize);
    return {
      TotalCount: result.totalCount,
      Commands: result.commands.map((c) => this.toContract(c)),
    };
  }

  @Patch(":commandId/state/:state")
  @RequireScopes("commands:write")
  async updateState(
    @TenantContext() ctx: { tenantId: string },
    @Param("commandId") commandId: string,
    @Param("state") state: string,
  ) {
    const command = await this.commandsService.updateState(ctx.tenantId, commandId, Number(state));
    return { Command: this.toContract(command) };
  }

  @Post(":commandId")
  @RequireScopes("commands:write")
  async run(
    @TenantContext() ctx: { tenantId: string },
    @Param("commandId") commandId: string,
    @Body() body: RunCommandBody,
  ) {
    await this.commandsService.enqueueRun(ctx.tenantId, commandId, body);
    return { success: true };
  }

  private toContract(command: CommandRow) {
    return {
      ID: command.id,
      Name: command.name,
      Type: command.type,
      IsEnabled: command.isEnabled,
      Unlocked: command.unlocked,
      GroupName: command.groupName,
    };
  }
}
