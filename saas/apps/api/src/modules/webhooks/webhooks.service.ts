import { randomBytes, randomUUID } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service.js";
import { PubSubPublisher } from "../../events/pubsub.publisher.js";
import type { CreateWebhookBody } from "./dto/create-webhook.body.js";

const MAX_WEBHOOKS_PER_TENANT = 5;

export interface WebhookListItem {
  id: string;
  name: string;
  commandId: string;
  url: string;
  isEnabled: boolean;
  createdAt: Date;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pubsub: PubSubPublisher,
  ) {}

  async create(tenantId: string, dto: CreateWebhookBody) {
    const count = await this.prisma.webhookCommand.count({ where: { tenantId } });
    if (count >= MAX_WEBHOOKS_PER_TENANT) {
      throw new BadRequestException(
        `Maximum of ${MAX_WEBHOOKS_PER_TENANT} webhooks per tenant exceeded`,
      );
    }

    const secret = randomBytes(32).toString("hex");

    // Create the associated command first
    const command = await this.prisma.command.create({
      data: {
        tenantId,
        name: `Webhook: ${dto.name}`,
        type: "webhook",
        isEnabled: true,
        unlocked: true,
        definition: (dto.commandDefinition ?? { actions: [] }) as Prisma.InputJsonValue,
      },
    });

    const webhookCommand = await this.prisma.webhookCommand.create({
      data: {
        tenantId,
        name: dto.name,
        secret,
        commandId: command.id,
        isEnabled: true,
      },
    });

    this.logger.log(`Created webhook command ${webhookCommand.id} for tenant ${tenantId}`);

    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";
    const webhookUrl = `${baseUrl}/api/v2/webhooks/${webhookCommand.id}/trigger?secret=${secret}`;

    return {
      id: webhookCommand.id,
      name: webhookCommand.name,
      commandId: command.id,
      url: webhookUrl,
      secret,
      isEnabled: webhookCommand.isEnabled,
      createdAt: webhookCommand.createdAt,
    };
  }

  async list(tenantId: string): Promise<WebhookListItem[]> {
    const webhookCommands = await this.prisma.webhookCommand.findMany({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
    });

    const baseUrl = process.env.API_BASE_URL ?? "http://localhost:3000";

    return webhookCommands.map((wc) => ({
      id: wc.id,
      name: wc.name,
      commandId: wc.commandId,
      url: `${baseUrl}/api/v2/webhooks/${wc.id}/trigger?secret=${wc.secret}`,
      isEnabled: wc.isEnabled,
      createdAt: wc.createdAt,
    }));
  }

  async delete(tenantId: string, webhookId: string) {
    const webhookCommand = await this.prisma.webhookCommand.findFirst({
      where: { id: webhookId, tenantId },
    });
    if (!webhookCommand) {
      throw new NotFoundException(`Webhook with ID '${webhookId}' not found`);
    }

    // Delete the webhook command record and associated command in a transaction
    await this.prisma.$transaction([
      this.prisma.webhookCommand.delete({ where: { id: webhookCommand.id } }),
      this.prisma.command.deleteMany({
        where: { id: webhookCommand.commandId, tenantId },
      }),
    ]);

    this.logger.log(`Deleted webhook command ${webhookId} for tenant ${tenantId}`);
  }

  async trigger(webhookId: string, secret: string, payload: Record<string, unknown>) {
    const webhookCommand = await this.prisma.webhookCommand.findFirst({
      where: { id: webhookId },
    });

    if (!webhookCommand) {
      throw new NotFoundException("Webhook not found");
    }

    if (webhookCommand.secret !== secret) {
      throw new ForbiddenException("Invalid webhook secret");
    }

    if (!webhookCommand.isEnabled) {
      throw new BadRequestException("Webhook is disabled");
    }

    // Flatten payload fields into special identifiers with $payload. prefix
    const specialIdentifiers: Record<string, string> = {};
    for (const [key, value] of Object.entries(payload)) {
      specialIdentifiers[`$payload.${key}`] = String(value);
    }

    const executionId = randomUUID();

    await this.prisma.commandExecution.create({
      data: {
        id: executionId,
        tenantId: webhookCommand.tenantId,
        commandId: webhookCommand.commandId,
        status: "pending",
        triggerType: "webhook",
        input: {
          webhookId: webhookCommand.id,
          webhookName: webhookCommand.name,
          payload,
          specialIdentifiers,
        } as Prisma.InputJsonValue,
      },
    });

    await this.pubsub.publishCommandRun(
      webhookCommand.tenantId,
      webhookCommand.commandId,
      {
        executionId,
        triggerType: "webhook",
        webhookId: webhookCommand.id,
        payload,
        specialIdentifiers,
        isTestRun: false,
      },
    );

    this.logger.log(
      `Webhook ${webhookCommand.id} triggered -> execution ${executionId}`,
    );

    return {
      accepted: true,
      executionId,
    };
  }
}
