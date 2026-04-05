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
  "moderator:manage:chat_messages",
  "channel:bot",
].join(" ");

const REDIRECT_URI =
  process.env.TWITCH_REDIRECT_URI ??
  "https://w3s.connect3.io/api/v2/auth/twitch/callback";

const ALL_SCOPES =
  "commands:read commands:write counters:read counters:write currency:read currency:write inventory:read inventory:write users:read users:write webhooks:read webhooks:write migration:write settings:read settings:write";

@Controller("api/v2/auth/twitch")
export class TwitchOAuthController {
  private readonly logger = new Logger(TwitchOAuthController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly eventSubService: TwitchEventSubService,
  ) {}

  /**
   * GET /api/v2/auth/twitch/connect
   *
   * Initiates Twitch OAuth flow. Accepts optional tenant_id (for existing users
   * reconnecting) and optional redirect_uri (for frontend redirect after auth).
   * If no tenant_id is provided, a new tenant will be created on callback.
   */
  @Public()
  @Get("connect")
  connect(
    @Query("tenant_id") tenantId: string | undefined,
    @Query("redirect_uri") redirectUri: string | undefined,
    @Res() reply: FastifyReply,
  ): void {
    const clientId = process.env.TWITCH_CLIENT_ID ?? "";

    const statePayload: { tenantId?: string; redirectUri?: string } = {};
    if (tenantId) statePayload.tenantId = tenantId;
    if (redirectUri) statePayload.redirectUri = redirectUri;

    const state = Buffer.from(JSON.stringify(statePayload)).toString("base64url");

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

    // Decode state
    let tenantId: string | undefined;
    let redirectUri: string | undefined;
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString("utf-8")) as {
        tenantId?: string;
        redirectUri?: string;
      };
      tenantId = decoded.tenantId;
      redirectUri = decoded.redirectUri;
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
    let email: string | undefined;

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
        data: Array<{ id: string; login: string; display_name: string; email?: string }>;
      };

      const user = userData.data[0];
      if (!user) throw new Error("No user returned from Twitch");

      platformUserId = user.id;
      username = user.login;
      displayName = user.display_name;
      email = user.email;
    } catch (err) {
      this.logger.error("Failed to fetch Twitch user info", err);
      void reply
        .status(500)
        .type("text/html")
        .send("<html><body><h2>Failed to fetch Twitch user info.</h2></body></html>");
      return;
    }

    // ── Auto-provision: AppUser + Tenant + TenantMembership ──────────────
    const subject = `twitch-${platformUserId}`;

    try {
      const result = await this.prisma.$transaction(async (tx) => {
        // Upsert AppUser keyed by Twitch subject
        const appUser = await tx.appUser.upsert({
          where: { subject },
          create: {
            subject,
            email: email ?? null,
            displayName,
          },
          update: {
            ...(email ? { email } : {}),
            displayName,
          },
        });

        // Check existing membership
        const existingMembership = await tx.tenantMembership.findFirst({
          where: { userId: appUser.id },
          include: { tenant: true },
        });

        let tenant: { id: string; slug: string; name: string };
        let role: string;

        if (existingMembership) {
          // User already has a tenant
          tenant = existingMembership.tenant;
          role = existingMembership.role;
        } else if (tenantId) {
          // Connecting to an existing tenant (provided via query param)
          const existingTenant = await tx.tenant.findUnique({ where: { id: tenantId } });
          if (!existingTenant) {
            throw new Error(`Tenant ${tenantId} not found`);
          }
          tenant = existingTenant;
          await tx.tenantMembership.create({
            data: { tenantId: tenant.id, userId: appUser.id, role: "owner" },
          });
          role = "owner";
        } else {
          // New user: create a new tenant
          const slug = await this.ensureUniqueSlug(tx, this.generateSlug(displayName));
          tenant = await tx.tenant.create({
            data: {
              slug,
              name: `${displayName}'s Stream`,
            },
          });
          await tx.tenantMembership.create({
            data: { tenantId: tenant.id, userId: appUser.id, role: "owner" },
          });
          role = "owner";
        }

        return { appUser, tenant, role };
      });

      tenantId = result.tenant.id;

      this.logger.log(
        `Provisioned/resolved user ${result.appUser.id} for tenant ${result.tenant.id} (slug: ${result.tenant.slug})`,
      );

      // Upsert IntegrationConnection (outside the user-provision transaction)
      await this.prisma.integrationConnection.upsert({
        where: { tenantId_platform: { tenantId: result.tenant.id, platform: "twitch" } },
        create: {
          tenantId: result.tenant.id,
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
        `Stored Twitch connection for tenant ${result.tenant.id} (user: ${username}, id: ${platformUserId})`,
      );

      // Subscribe to EventSub (non-fatal)
      try {
        await this.eventSubService.subscribeToChat(result.tenant.id);
        this.logger.log(`EventSub subscriptions created for tenant ${result.tenant.id}`);
      } catch (err) {
        this.logger.error("EventSub subscription setup failed (non-fatal)", err);
      }

      // ── Generate dev JWT ──────────────────────────────────────────────
      const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          sub: subject,
          iss: "dev",
          aud: "dev",
          exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
          iat: Math.floor(Date.now() / 1000),
          tenant_id: result.tenant.id,
          scope: ALL_SCOPES,
          roles: [result.role],
          email: email ?? null,
          name: displayName,
          twitch_username: username,
          twitch_id: platformUserId,
        }),
      ).toString("base64url");

      const token = `${header}.${payload}.dev`;

      // ── Redirect to frontend with token ───────────────────────────────
      const targetRedirect = redirectUri ?? (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/dashboard` : "");
      if (targetRedirect) {
        const targetUrl = `${targetRedirect}#token=${token}`;
        this.logger.log(`Redirecting to: ${targetRedirect}`);
        void reply.status(302).redirect(targetUrl);
      } else {
        // Fallback: show success HTML with token for manual copy
        void reply.status(200).type("text/html").send(`<!DOCTYPE html>
<html>
<head><title>w3StreamItUp - Connected</title></head>
<body style="font-family: sans-serif; text-align: center; padding: 60px; background: #0f172a; color: #e2e8f0;">
  <h1 style="color: #a78bfa;">Twitch Connected!</h1>
  <p>Account: <strong>${displayName}</strong> (${username})</p>
  <p>Tenant: <strong>${tenantId}</strong></p>
  <p style="margin-top: 20px; font-size: 12px; color: #94a3b8;">Your token has been generated. You can close this window.</p>
</body>
</html>`);
      }
    } catch (err) {
      this.logger.error("Failed to provision user or store connection", err);
      void reply
        .status(500)
        .type("text/html")
        .send("<html><body><h2>Failed to complete login. Please try again.</h2></body></html>");
    }
  }

  private generateSlug(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40) || "stream"
    );
  }

  private async ensureUniqueSlug(
    tx: { tenant: { findUnique: (args: { where: { slug: string } }) => Promise<unknown> } },
    baseSlug: string,
  ): Promise<string> {
    let slug = baseSlug;
    let suffix = 0;
    while (await tx.tenant.findUnique({ where: { slug } })) {
      suffix++;
      slug = `${baseSlug}-${suffix}`;
    }
    return slug;
  }
}
