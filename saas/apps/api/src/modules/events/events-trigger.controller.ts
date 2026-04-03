import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { EventTriggerService } from "./event-trigger.service.js";
import type { PlatformEvent } from "./event-trigger.service.js";
import { GenericEventBody } from "./dto/generic-event.body.js";
import { TwitchFollowBody } from "./dto/twitch-follow.body.js";
import { TwitchSubscribeBody } from "./dto/twitch-subscribe.body.js";
import { TwitchBitsBody } from "./dto/twitch-bits.body.js";
import { TwitchChannelPointsBody } from "./dto/twitch-channel-points.body.js";
import { TwitchRaidBody } from "./dto/twitch-raid.body.js";

@ApiTags("Events")
@Controller("api/v2/events")
export class EventsTriggerController {
  constructor(private readonly eventTriggerService: EventTriggerService) {}

  @Post("trigger")
  @RequireScopes("events:write")
  async triggerGeneric(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: GenericEventBody,
  ) {
    const event: PlatformEvent = {
      tenantId: ctx.tenantId,
      platform: body.platform,
      eventType: body.eventType,
      userId: body.userId,
      username: body.username,
      displayName: body.displayName,
      data: body.data ?? {},
    };

    const result = await this.eventTriggerService.processEvent(event);
    return {
      Triggered: result.triggered,
      Executions: result.executions,
    };
  }

  @Post("twitch/follow")
  @RequireScopes("events:write")
  async twitchFollow(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: TwitchFollowBody,
  ) {
    const event: PlatformEvent = {
      tenantId: ctx.tenantId,
      platform: "twitch",
      eventType: "follow",
      userId: body.userId,
      username: body.username,
      displayName: body.displayName ?? body.username,
      data: {
        userId: body.userId,
        username: body.username,
        displayName: body.displayName ?? body.username,
      },
    };

    const result = await this.eventTriggerService.processEvent(event);
    return {
      Triggered: result.triggered,
      Executions: result.executions,
    };
  }

  @Post("twitch/subscribe")
  @RequireScopes("events:write")
  async twitchSubscribe(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: TwitchSubscribeBody,
  ) {
    const eventType = body.isResub ? "resubscribe" : "subscribe";
    const event: PlatformEvent = {
      tenantId: ctx.tenantId,
      platform: "twitch",
      eventType,
      userId: body.userId,
      username: body.username,
      displayName: body.displayName ?? body.username,
      data: {
        userId: body.userId,
        username: body.username,
        displayName: body.displayName ?? body.username,
        tier: body.tier ?? "1000",
        months: body.months ?? 1,
        isResub: body.isResub ?? false,
        message: body.message ?? "",
        gifterId: body.gifterId ?? "",
        gifterUsername: body.gifterUsername ?? "",
      },
    };

    const result = await this.eventTriggerService.processEvent(event);
    return {
      Triggered: result.triggered,
      Executions: result.executions,
    };
  }

  @Post("twitch/bits")
  @RequireScopes("events:write")
  async twitchBits(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: TwitchBitsBody,
  ) {
    const event: PlatformEvent = {
      tenantId: ctx.tenantId,
      platform: "twitch",
      eventType: "bits",
      userId: body.userId,
      username: body.username,
      displayName: body.displayName ?? body.username,
      data: {
        userId: body.userId,
        username: body.username,
        displayName: body.displayName ?? body.username,
        amount: body.amount,
        message: body.message ?? "",
      },
    };

    const result = await this.eventTriggerService.processEvent(event);
    return {
      Triggered: result.triggered,
      Executions: result.executions,
    };
  }

  @Post("twitch/channel-points")
  @RequireScopes("events:write")
  async twitchChannelPoints(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: TwitchChannelPointsBody,
  ) {
    const event: PlatformEvent = {
      tenantId: ctx.tenantId,
      platform: "twitch",
      eventType: "channel_point_redeem",
      userId: body.userId,
      username: body.username,
      displayName: body.displayName ?? body.username,
      data: {
        userId: body.userId,
        username: body.username,
        displayName: body.displayName ?? body.username,
        rewardName: body.rewardName,
        rewardId: body.rewardId ?? "",
        cost: body.cost ?? 0,
        userInput: body.userInput ?? "",
      },
    };

    const result = await this.eventTriggerService.processEvent(event);
    return {
      Triggered: result.triggered,
      Executions: result.executions,
    };
  }

  @Post("twitch/raid")
  @RequireScopes("events:write")
  async twitchRaid(
    @TenantContext() ctx: { tenantId: string },
    @Body() body: TwitchRaidBody,
  ) {
    const event: PlatformEvent = {
      tenantId: ctx.tenantId,
      platform: "twitch",
      eventType: "raid",
      userId: body.userId,
      username: body.username,
      displayName: body.displayName ?? body.username,
      data: {
        userId: body.userId,
        username: body.username,
        displayName: body.displayName ?? body.username,
        viewers: body.viewers,
      },
    };

    const result = await this.eventTriggerService.processEvent(event);
    return {
      Triggered: result.triggered,
      Executions: result.executions,
    };
  }
}
