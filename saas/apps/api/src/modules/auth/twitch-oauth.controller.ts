import { Controller, Get, Logger, Query, Res } from "@nestjs/common";
import type { FastifyReply } from "fastify";
import { Public } from "../../auth/public.decorator.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TwitchEventSubService } from "./twitch-eventsub.service.js";

const TWITCH_AUTHORIZE_URL = "https://id.twitch.tv/oauth2/authorize";
const TWITCH_TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const TWITCH_USERS_URL = "https://api.twitch.tv/helix/users";

const SCOPES = [
  "chat:read",
  "chat:edit",
  "channel:read:subscriptions",
  "moderator:read:followers",
  "bits:read",
  "channel:read:redemptions",
  "channel:manage:redemptions",
  "user:read:email",
  "user:read:chat",
  "user:write:chat",
  "user:bot",
  "channel:bot",
].join(" ");

const REDIRECT_URI =
  process.env.TWITCH_REDIRECT_URI ??
  "https://w3s.connect3.io/api/v2/auth/twitch/callback";

@Controller("api/v2/auth/twitch")
export class TwitchOAuthController {
  private readonly logger = new Logger(TwitchOAuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventSubService: TwitchEventSubService,
  ) {}

  @Public()
  @Get("connect")
  connect(@Query("tenant_id") tenantId: string, @Res() reply: FastifyReply): void {
    if (!tenantId) {
      void reply.status(400).send({ error: "tenant_id query parameter is required" });
      return;
    }

    const clientId = process.env.TWITCH_CLIENT_ID ?? "";
    const state = Buffer.from(JSON.stringify({ tenantId })).toString("base64url");

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: REDIRECT_URI,
      response_type: "code",
      scope: SCOPES,
      state,
      force_verify: "true",
    });

    const url = `${TWITCH_AUTHORIZE_URL}?${params.toString()}`;
    void reply.status(302).redirect(url);
  }

  @Public()
  @Get("callback")
  async callback(
    @Query("code") code: string,
    @Query("state") state: string,
    @Query("error") error: string,
    @Res() reply: FastifyReply,
  ): Promise<void> {
    if (error) {
      this.logger.warn(`Twitch OAuth error: ${error}`);
      void reply
        .status(400)
        .type("text/html")
        .send("<html><body><h2>Twitch authorization was denied.</h2></body></html>");
      return;
    }

    if (!code || !state) {
      void reply.status(400).send({ error: "Missing code or state parameter" });
      return;
    }

    // Decode tenant_id from state
    let tenantId: string;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as {
        tenantId: string;
      };
      tenantId = decoded.tenantId;
    } catch {
      void reply.status(400).send({ error: "Invalid state parameter" });
      return;
    }

    const clientId = process.env.TWITCH_CLIENT_ID ?? "";
    const clientSecret = process.env.TWITCH_CLIENT_SECRET ?? "";

    // Exchange code for tokens
    let accessToken: string;
    let refreshToken: string;
    let expiresIn: number;
    let scopeStr: string;

    try {
      const tokenRes = await fetch(TWITCH_TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: REDIRECT_URI,
        }),
      });

      if (!tokenRes.ok) {
        const errBody = await tokenRes.text();
        this.logger.error(`Twitch token exchange failed: ${errBody}`);
        void reply
          .status(500)
          .type("text/html")
          .send("<html><body><h2>Failed to exchange Twitch authorization code.</h2></body></html>");
        return;
      }

      const tokenData = (await tokenRes.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
        scope: string[];
      };

      accessToken = tokenData.access_token;
      refreshToken = tokenData.refresh_token;
      expiresIn = tokenData.expires_in;
      scopeStr = tokenData.scope.join(" ");
    } catch (err) {
      this.logger.error("Token exchange error", err);
      void reply
        .status(500)
        .type("text/html")
        .send("<html><body><h2>Token exchange failed.</h2></body></html>");
      return;
    }

    // Get Twitch user info
    let platformUserId: string;
    let username: string;
    let displayName: string;

    try {
      const userRes = await fetch(TWITCH_USERS_URL, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Client-Id": clientId,
        },
      });

      if (!userRes.ok) {
        throw new Error(`Twitch users API returned ${userRes.status}`);
      }

      const userData = (await userRes.json()) as {
        data: Array<{ id: string; login: string; display_name: string }>;
      };

      const user = userData.data[0];
      if (!user) throw new Error("No user returned from Twitch");

      platformUserId = user.id;
      username = user.login;
      displayName = user.display_name;
    } catch (err) {
      this.logger.error("Failed to fetch Twitch user info", err);
      void reply
        .status(500)
        .type("text/html")
        .send("<html><body><h2>Failed to fetch Twitch user info.</h2></body></html>");
      return;
    }

    // Upsert IntegrationConnection
    try {
      await this.prisma.integrationConnection.upsert({
        where: { tenantId_platform: { tenantId, platform: "twitch" } },
        create: {
          tenantId,
          platform: "twitch",
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
          scope: scopeStr,
          platformUserId,
          metadata: { username, displayName },
        },
        update: {
          accessToken,
          refreshToken,
          expiresAt: new Date(Date.now() + expiresIn * 1000),
          scope: scopeStr,
          platformUserId,
          metadata: { username, displayName },
        },
      });

      this.logger.log(
        `Stored Twitch connection for tenant ${tenantId} (user: ${username}, id: ${platformUserId})`,
      );
    } catch (err) {
      this.logger.error("Failed to store integration connection", err);
      void reply
        .status(500)
        .type("text/html")
        .send("<html><body><h2>Failed to store connection.</h2></body></html>");
      return;
    }

    // Subscribe to EventSub
    try {
      await this.eventSubService.subscribeToChat(tenantId);
      this.logger.log(`EventSub subscriptions created for tenant ${tenantId}`);
    } catch (err) {
      // Non-fatal: log but still report success to user
      this.logger.error("EventSub subscription setup failed (non-fatal)", err);
    }

    void reply.status(200).type("text/html").send(`<!DOCTYPE html>
<html>
<head><title>w3StreamItUp - Twitch Connected</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 60px;">
  <h1>Twitch Connected Successfully!</h1>
  <p>Account: <strong>${displayName}</strong> (${username})</p>
  <p>You can close this window.</p>
</body>
</html>`);
  }
}
