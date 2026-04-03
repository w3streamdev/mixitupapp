import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

const TWITCH_EVENTSUB_URL = "https://api.twitch.tv/helix/eventsub/subscriptions";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";

const CALLBACK_URL =
  process.env.TWITCH_EVENTSUB_CALLBACK ??
  "https://w3s.connect3.io/api/v2/twitch/eventsub";

interface AppTokenCache {
  token: string;
  expiresAt: number;
}

@Injectable()
export class TwitchEventSubService {
  private readonly logger = new Logger(TwitchEventSubService.name);
  private appTokenCache: AppTokenCache | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Subscribe to all relevant EventSub events for a tenant's Twitch channel.
   */
  async subscribeToChat(tenantId: string): Promise<void> {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { tenantId_platform: { tenantId, platform: "twitch" } },
    });

    if (!connection || !connection.platformUserId) {
      this.logger.warn(`No Twitch connection found for tenant ${tenantId}`);
      return;
    }

    const broadcasterId = connection.platformUserId;
    const userToken = connection.accessToken;
    const appToken = await this.getAppAccessToken();
    const secret = this.getWebhookSecret();
    const clientId = process.env.TWITCH_CLIENT_ID ?? "";

    const appHeaders = {
      Authorization: `Bearer ${appToken}`,
      "Client-Id": clientId,
      "Content-Type": "application/json",
    };
    // channel.chat.message requires a user access token with user:read:chat
    const userHeaders = {
      Authorization: `Bearer ${userToken}`,
      "Client-Id": clientId,
      "Content-Type": "application/json",
    };

    // Define subscriptions to create
    // requiresUserToken: channel.chat.message requires the user's OAuth token
    const subscriptions: Array<{
      type: string;
      version: string;
      condition: Record<string, string>;
      useUserToken?: boolean;
    }> = [
      {
        type: "channel.chat.message",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId, user_id: broadcasterId },
      },
      {
        type: "channel.follow",
        version: "2",
        condition: { broadcaster_user_id: broadcasterId, moderator_user_id: broadcasterId },
      },
      {
        type: "channel.subscribe",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.subscription.gift",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.cheer",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.channel_points_custom_reward_redemption.add",
        version: "1",
        condition: { broadcaster_user_id: broadcasterId },
      },
      {
        type: "channel.raid",
        version: "1",
        condition: { to_broadcaster_user_id: broadcasterId },
      },
    ];

    // First, clean up existing subscriptions for this broadcaster
    await this.deleteExistingSubscriptions(broadcasterId, appToken, clientId);

    // Create all subscriptions
    for (const sub of subscriptions) {
      try {
        const body = {
          type: sub.type,
          version: sub.version,
          condition: sub.condition,
          transport: {
            method: "webhook",
            callback: CALLBACK_URL,
            secret,
          },
        };

        const res = await fetch(TWITCH_EVENTSUB_URL, {
          method: "POST",
          headers: sub.useUserToken ? userHeaders : appHeaders,
          body: JSON.stringify(body),
        });

        if (res.ok || res.status === 409) {
          // 409 = already exists, which is fine
          this.logger.log(
            `EventSub subscription created: ${sub.type} for broadcaster ${broadcasterId}`,
          );
        } else {
          const errBody = await res.text();
          this.logger.error(
            `Failed to create EventSub ${sub.type}: ${res.status} - ${errBody}`,
          );
        }
      } catch (err) {
        this.logger.error(`Error creating EventSub subscription ${sub.type}`, err);
      }
    }
  }

  /**
   * Delete existing EventSub subscriptions for a broadcaster to avoid duplicates.
   */
  private async deleteExistingSubscriptions(
    broadcasterId: string,
    appToken: string,
    clientId: string,
  ): Promise<void> {
    try {
      const res = await fetch(TWITCH_EVENTSUB_URL, {
        headers: {
          Authorization: `Bearer ${appToken}`,
          "Client-Id": clientId,
        },
      });

      if (!res.ok) return;

      const data = (await res.json()) as {
        data: Array<{
          id: string;
          condition: Record<string, string>;
          transport: { callback: string };
        }>;
      };

      for (const sub of data.data) {
        const matchesBroadcaster =
          sub.condition.broadcaster_user_id === broadcasterId ||
          sub.condition.to_broadcaster_user_id === broadcasterId;
        const matchesCallback = sub.transport.callback === CALLBACK_URL;

        if (matchesBroadcaster && matchesCallback) {
          await fetch(`${TWITCH_EVENTSUB_URL}?id=${sub.id}`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${appToken}`,
              "Client-Id": clientId,
            },
          });
          this.logger.log(`Deleted existing EventSub subscription ${sub.id}`);
        }
      }
    } catch (err) {
      this.logger.warn("Failed to clean up existing EventSub subscriptions", err);
    }
  }

  /**
   * Get an app access token using client_credentials grant.
   * Cached until near expiry.
   */
  async getAppAccessToken(): Promise<string> {
    if (this.appTokenCache && Date.now() < this.appTokenCache.expiresAt - 60_000) {
      return this.appTokenCache.token;
    }

    const clientId = process.env.TWITCH_CLIENT_ID ?? "";
    const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? "";

    const res = await fetch(TWITCH_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "client_credentials",
      }),
    });

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Failed to get Twitch app access token: ${res.status} - ${errBody}`);
    }

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };

    this.appTokenCache = {
      token: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };

    this.logger.log("Obtained Twitch app access token");
    return data.access_token;
  }

  /**
   * Get the webhook secret used for EventSub signature verification.
   */
  getWebhookSecret(): string {
    return process.env.TWITCH_EVENTSUB_SECRET ?? "mixitup-eventsub-secret-change-me";
  }
}
