import type { PrismaClient } from "@prisma/client";

const logger = {
  log: (msg: string) => console.log(`[PlatformChatService] ${msg}`),
  warn: (msg: string) => console.warn(`[PlatformChatService] ${msg}`),
  error: (msg: string, err?: unknown) =>
    console.error(`[PlatformChatService] ${msg}`, err),
};

export class PlatformChatService {
  constructor(private readonly prisma: PrismaClient) {}

  async sendMessage(
    tenantId: string,
    platform: string,
    message: string,
  ): Promise<void> {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { tenantId_platform: { tenantId, platform } },
    });

    if (!connection) {
      logger.warn(`No ${platform} connection found for tenant ${tenantId}`);
      return;
    }

    let accessToken = connection.accessToken;

    // Refresh token if expired
    if (connection.expiresAt <= new Date()) {
      const refreshed = await this.refreshToken(connection.id, connection.refreshToken, platform);
      if (!refreshed) {
        logger.error(`Failed to refresh ${platform} token for tenant ${tenantId}`);
        return;
      }
      accessToken = refreshed;
    }

    if (platform === "twitch") {
      await this.sendTwitchMessage(accessToken, connection.platformUserId ?? "", message);
    } else {
      logger.warn(`Platform "${platform}" chat is not yet supported`);
    }
  }

  private async sendTwitchMessage(
    accessToken: string,
    broadcasterId: string,
    message: string,
  ): Promise<void> {
    const clientId = process.env.TWITCH_CLIENT_ID ?? "";

    const response = await fetch("https://api.twitch.tv/helix/chat/messages", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": clientId,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        broadcaster_id: broadcasterId,
        sender_id: broadcasterId,
        message,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(`Twitch chat API returned ${response.status}: ${body}`);
    } else {
      logger.log(`Sent Twitch chat message to broadcaster ${broadcasterId}`);
    }
  }

  private async refreshToken(
    connectionId: string,
    refreshToken: string,
    platform: string,
  ): Promise<string | null> {
    if (platform !== "twitch") {
      logger.warn(`Token refresh not implemented for platform "${platform}"`);
      return null;
    }

    const clientId = process.env.TWITCH_CLIENT_ID ?? "";
    const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? "";

    try {
      const response = await fetch("https://id.twitch.tv/oauth2/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: clientId,
          client_secret: clientSecret,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        logger.error(`Token refresh failed with status ${response.status}`);
        return null;
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      await this.prisma.integrationConnection.update({
        where: { id: connectionId },
        data: {
          accessToken: data.access_token,
          refreshToken: data.refresh_token,
          expiresAt: new Date(Date.now() + data.expires_in * 1000),
        },
      });

      logger.log(`Refreshed ${platform} token for connection ${connectionId}`);
      return data.access_token;
    } catch (err) {
      logger.error("Token refresh error", err);
      return null;
    }
  }
}
