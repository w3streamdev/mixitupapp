import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { CommandsService } from "./commands.service.js";
import { CreateCommandBody } from "./dto/create-command.body.js";
import { UpdateCommandBody } from "./dto/update-command.body.js";
import { ChatTriggerBody } from "./dto/chat-trigger.body.js";
import { CommandHistoryQuery } from "./dto/command-history.query.js";
import { GetListCommandsQuery } from "./dto/get-list-commands.query.js";
import { RunCommandBody } from "./dto/run-command.body.js";

interface CommandRow {
  id: string;
  name: string;
  type: string;
  isEnabled: boolean;
  unlocked: boolean;
  groupName: string | null;
  definition?: unknown;
}

interface ExecutionRow {
  id: string;
  commandId: string;
  status: string;
  triggerType: string;
  platform: string | null;
  userId: string | null;
  input: unknown;
  output: unknown;
  error: string | null;
  durationMs: number | null;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
}

@ApiTags("Commands")
@Controller("api/v2/commands")
export class CommandsController {
  constructor(private readonly commandsService: CommandsService) {}

  @Get("history")
  @RequireScopes("commands:read")
  async getHistory(
    @TenantContext() ctx: { tenantId: string },
    @Query() query: CommandHistoryQuery,
  ) {
    const result = await this.commandsService.getHistory(ctx.tenantId, query);
    return {
      TotalCount: result.totalCount,
      Executions: result.executions.map((e) => this.toExecutionContract(e)),
    };
  }

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

  @Post("chat-trigger")
  @RequireScopes("commands:write")
  async chatTrigger(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: ChatTriggerBody,
  ) {
    const result = await this.commandsService.triggerFromChat(ctx.tenantId, body);
    return result;
  }

  @Post()
  @RequireScopes("commands:write")
  async create(@TenantContext() ctx: { tenantId: string }, @Body() body: CreateCommandBody) {
    const command = await this.commandsService.create(ctx.tenantId, body);
    return { Command: this.toContract(command) };
  }

  @Put(":commandId")
  @RequireScopes("commands:write")
  async update(
    @TenantContext() ctx: { tenantId: string },
    @Param("commandId") commandId: string,
    @Body() body: UpdateCommandBody,
  ) {
    const command = await this.commandsService.update(ctx.tenantId, commandId, body);
    return { Command: this.toContract(command) };
  }

  @Delete(":commandId")
  @RequireScopes("commands:write")
  async remove(
    @TenantContext() ctx: { tenantId: string },
    @Param("commandId") commandId: string,
  ) {
    await this.commandsService.delete(ctx.tenantId, commandId);
    return { success: true };
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
    const result = await this.commandsService.enqueueRun(ctx.tenantId, commandId, body as Record<string, unknown>);
    return { success: true, executionId: result.executionId };
  }

  @Post(":commandId/test")
  @RequireScopes("commands:write")
  async testRun(
    @TenantContext() ctx: { tenantId: string },
    @Param("commandId") commandId: string,
    @Body() body: RunCommandBody,
  ) {
    const result = await this.commandsService.enqueueRun(
      ctx.tenantId,
      commandId,
      body as Record<string, unknown>,
      { isTestRun: true },
    );
    return { success: true, executionId: result.executionId };
  }

  private toContract(command: CommandRow) {
    return {
      ID: command.id,
      Name: command.name,
      Type: command.type,
      IsEnabled: command.isEnabled,
      Unlocked: command.unlocked,
      GroupName: command.groupName,
      Definition: command.definition ?? null,
    };
  }

  private toExecutionContract(execution: ExecutionRow) {
    return {
      ID: execution.id,
      CommandID: execution.commandId,
      Status: execution.status,
      TriggerType: execution.triggerType,
      Platform: execution.platform,
      UserID: execution.userId,
      Input: execution.input,
      Output: execution.output,
      Error: execution.error,
      DurationMs: execution.durationMs,
      StartedAt: execution.startedAt.toISOString(),
      CompletedAt: execution.completedAt?.toISOString() ?? null,
      CreatedAt: execution.createdAt.toISOString(),
    };
  }
}
