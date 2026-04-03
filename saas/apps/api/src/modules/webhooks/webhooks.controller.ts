import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../auth/public.decorator.js";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { WebhooksService } from "./webhooks.service.js";
import { CreateWebhookBody } from "./dto/create-webhook.body.js";
import { TriggerWebhookQuery } from "./dto/trigger-webhook.query.js";

@ApiTags("Webhooks")
@Controller("api/v2/webhooks")
export class WebhooksController {
  constructor(private readonly webhooksService: WebhooksService) {}

  @Post()
  @RequireScopes("commands:write")
  async create(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: CreateWebhookBody,
  ) {
    const result = await this.webhooksService.create(ctx.tenantId, body);
    return {
      Webhook: {
        ID: result.id,
        Name: result.name,
        CommandID: result.commandId,
        URL: result.url,
        Secret: result.secret,
        IsEnabled: result.isEnabled,
        CreatedAt: result.createdAt.toISOString(),
      },
    };
  }

  @Get()
  @RequireScopes("commands:read")
  async list(@TenantContext() ctx: { tenantId: string }) {
    const webhooks = await this.webhooksService.list(ctx.tenantId);
    return {
      Webhooks: webhooks.map((w) => ({
        ID: w.id,
        Name: w.name,
        CommandID: w.commandId,
        URL: w.url,
        IsEnabled: w.isEnabled,
        CreatedAt: w.createdAt.toISOString(),
      })),
    };
  }

  @Delete(":webhookId")
  @RequireScopes("commands:write")
  async remove(
    @TenantContext() ctx: { tenantId: string },
    @Param("webhookId") webhookId: string,
  ) {
    await this.webhooksService.delete(ctx.tenantId, webhookId);
    return { success: true };
  }

  @Post(":webhookId/trigger")
  @Public()
  async trigger(
    @Param("webhookId") webhookId: string,
    @Query() query: TriggerWebhookQuery,
    @Body() body: Record<string, unknown>,
  ) {
    const result = await this.webhooksService.trigger(webhookId, query.secret, body ?? {});
    return {
      accepted: result.accepted,
      executionId: result.executionId,
    };
  }
}
