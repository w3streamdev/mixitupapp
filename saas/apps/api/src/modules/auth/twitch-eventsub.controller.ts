import { createHmac, timingSafeEqual } from "node:crypto";
import { Body, Controller, Headers, Logger, Post, Req, Res } from "@nestjs/common";
import type { FastifyReply, FastifyRequest } from "fastify";
import { Public } from "../../auth/public.decorator.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { CommandsService } from "../commands/commands.service.js";
import { EventTriggerService } from "../events/event-trigger.service.js";
import { TwitchEventSubService } from "./twitch-eventsub.service.js";

const HMAC_PREFIX = "sha256=";

@Controller("api/v2/twitch")
export class TwitchEventSubController {
  private readonly logger = new Logger(TwitchEventSubController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly commandsService: CommandsService,
    private readonly eventTriggerService: EventTriggerService,
    private readonly eventSubService: TwitchEventSubService,
  ) {}

  @Public()
  @Post("eventsub")
  async handleEventSub(
    @Req() req: FastifyRequest,
    @Res() reply: FastifyReply,
    @Headers("twitch-eventsub-message-id") messageId: string,
    @Headers("twitch-eventsub-message-timestamp") messageTimestamp: string,
    @Headers("twitch-eventsub-message-signature") messageSignature: string,
    @Headers("twitch-eventsub-message-type") messageType: string,
    @Body() body: Record<string, unknown>,
  ): Promise<void> {
    // Verify the signature
    const rawBody = (req as FastifyRequest & { rawBody?: Buffer }).rawBody;
    if (!rawBody) {
      this.logger.error("rawBody not available on request - signature verification will use JSON.stringify fallback");
    }

    const bodyBytes = rawBody ?? Buffer.from(JSON.stringify(body), "utf-8");

    if (!this.verifySignature(messageId, messageTimestamp, bodyBytes, messageSignature)) {
      this.logger.warn("EventSub signature verification failed");
      void reply.status(403).send({ error: "Invalid signature" });
      return;
    }

    // Handle different message types
    if (messageType === "webhook_callback_verification") {
      const challenge = (body as { challenge?: string }).challenge;
      this.logger.log("EventSub webhook verification challenge received");
      // Twitch expects the raw challenge string with 200 and text/plain content-type
      void reply.status(200).type("text/plain").send(challenge ?? "");
      return;
    }

    if (messageType === "revocation") {
      const subscription = body.subscription as { type?: string; id?: string } | undefined;
      this.logger.warn(
        `EventSub subscription revoked: ${subscription?.type} (${subscription?.id})`,
      );
      void reply.status(200).send({ ok: true });
      return;
    }

    if (messageType === "notification") {
      // Process asynchronously so we respond to Twitch quickly
      void this.processNotification(body).catch((err) => {
        this.logger.error("Error processing EventSub notification", err);
      });
      void reply.status(200).send({ ok: true });
      return;
    }

    void reply.status(400).send({ error: "Unknown message type" });
  }

  private verifySignature(
    messageId: string,
    messageTimestamp: string,
    bodyBytes: Buffer,
    expectedSignature: string,
  ): boolean {
    if (!messageId || !messageTimestamp || !expectedSignature) {
      return false;
    }

    const secret = this.eventSubService.getWebhookSecret();
    const message = Buffer.concat([
      Buffer.from(messageId, "utf-8"),
      Buffer.from(messageTimestamp, "utf-8"),
      bodyBytes,
    ]);

    const hmac = createHmac("sha256", secret).update(message).digest("hex");
    const expected = expectedSignature.startsWith(HMAC_PREFIX)
      ? expectedSignature.slice(HMAC_PREFIX.length)
      : expectedSignature;

    try {
      return timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
    } catch {
      return false;
    }
  }

  private async processNotification(body: Record<string, unknown>): Promise<void> {
    const subscription = body.subscription as {
      type: string;
      condition: Record<string, string>;
    } | undefined;
    const event = body.event as Record<string, unknown> | undefined;

    if (!subscription || !event) {
      this.logger.warn("EventSub notification missing subscription or event");
      return;
    }

    const eventType = subscription.type;
    this.logger.log(`Processing EventSub notification: ${eventType}`);

    // Resolve tenant from broadcaster_user_id
    const broadcasterId =
      (event.broadcaster_user_id as string) ??
      (subscription.condition.broadcaster_user_id as string) ??
      (subscription.condition.to_broadcaster_user_id as string);

    if (!broadcasterId) {
      this.logger.warn("No broadcaster_user_id found in EventSub notification");
      return;
    }

    const connection = await this.prisma.integrationConnection.findFirst({
      where: { platform: "twitch", platformUserId: broadcasterId },
    });

    if (!connection) {
      this.logger.warn(`No tenant found for Twitch broadcaster ${broadcasterId}`);
      return;
    }

    const tenantId = connection.tenantId;

    switch (eventType) {
      case "channel.chat.message":
        await this.handleChatMessage(tenantId, event);
        break;

      case "channel.follow":
        await this.handleFollow(tenantId, event);
        break;

      case "channel.subscribe":
        await this.handleSubscription(tenantId, event);
        break;

      case "channel.subscription.gift":
        await this.handleSubGift(tenantId, event);
        break;

      case "channel.cheer":
        await this.handleCheer(tenantId, event);
        break;

      case "channel.channel_points_custom_reward_redemption.add":
        await this.handleChannelPointRedeem(tenantId, event);
        break;

      case "channel.raid":
        await this.handleRaid(tenantId, event);
        break;

      default:
        this.logger.log(`Unhandled EventSub type: ${eventType}`);
    }
  }

  private async handleChatMessage(
    tenantId: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    const chatterId = event.chatter_user_id as string;
    const chatterLogin = event.chatter_user_login as string;
    const chatterName = event.chatter_user_name as string;
    const messageData = event.message as { text?: string } | undefined;
    const messageText = messageData?.text ?? "";

    this.logger.log(
      `Chat message from ${chatterLogin} in tenant ${tenantId}: ${messageText.slice(0, 50)}`,
    );

    await this.commandsService.triggerFromChat(tenantId, {
      platform: "twitch",
      userId: chatterId,
      username: chatterLogin,
      displayName: chatterName,
      message: messageText,
    });
  }

  private async handleFollow(tenantId: string, event: Record<string, unknown>): Promise<void> {
    await this.eventTriggerService.processEvent({
      tenantId,
      platform: "twitch",
      eventType: "follow",
      userId: event.user_id as string,
      username: event.user_login as string,
      displayName: event.user_name as string,
      data: {
        followedAt: event.followed_at as string,
      },
    });
  }

  private async handleSubscription(
    tenantId: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    await this.eventTriggerService.processEvent({
      tenantId,
      platform: "twitch",
      eventType: "subscription",
      userId: event.user_id as string,
      username: event.user_login as string,
      displayName: event.user_name as string,
      data: {
        tier: event.tier as string,
        isGift: event.is_gift as boolean,
      },
    });
  }

  private async handleSubGift(tenantId: string, event: Record<string, unknown>): Promise<void> {
    await this.eventTriggerService.processEvent({
      tenantId,
      platform: "twitch",
      eventType: "subscription_gift",
      userId: event.user_id as string,
      username: event.user_login as string,
      displayName: event.user_name as string,
      data: {
        tier: event.tier as string,
        total: event.total as number,
        cumulativeTotal: event.cumulative_total as number,
        isAnonymous: event.is_anonymous as boolean,
      },
    });
  }

  private async handleCheer(tenantId: string, event: Record<string, unknown>): Promise<void> {
    await this.eventTriggerService.processEvent({
      tenantId,
      platform: "twitch",
      eventType: "bits",
      userId: event.user_id as string,
      username: event.user_login as string,
      displayName: event.user_name as string,
      data: {
        amount: event.bits as number,
        message: event.message as string,
        isAnonymous: event.is_anonymous as boolean,
      },
    });
  }

  private async handleChannelPointRedeem(
    tenantId: string,
    event: Record<string, unknown>,
  ): Promise<void> {
    const reward = event.reward as { id?: string; title?: string; cost?: number } | undefined;
    await this.eventTriggerService.processEvent({
      tenantId,
      platform: "twitch",
      eventType: "channel_point_redeem",
      userId: event.user_id as string,
      username: event.user_login as string,
      displayName: event.user_name as string,
      data: {
        rewardId: reward?.id ?? "",
        rewardName: reward?.title ?? "",
        rewardCost: reward?.cost ?? 0,
        userInput: event.user_input as string,
      },
    });
  }

  private async handleRaid(tenantId: string, event: Record<string, unknown>): Promise<void> {
    await this.eventTriggerService.processEvent({
      tenantId,
      platform: "twitch",
      eventType: "raid",
      userId: event.from_broadcaster_user_id as string,
      username: event.from_broadcaster_user_login as string,
      displayName: event.from_broadcaster_user_name as string,
      data: {
        viewers: event.viewers as number,
      },
    });
  }
}
