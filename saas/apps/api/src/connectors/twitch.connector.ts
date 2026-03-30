import { Injectable, Logger } from "@nestjs/common";
import type {
  PlatformConnector,
  ConnectorConfig,
  OAuthTokens,
  ConnectorUserInfo,
} from "./connector.interface.js";

@Injectable()
export class TwitchConnector implements PlatformConnector {
  readonly platform = "Twitch";
  private readonly logger = new Logger(TwitchConnector.name);
  private readonly config: ConnectorConfig;

  constructor() {
    this.config = {
      clientId: process.env.TWITCH_CLIENT_ID ?? "",
      clientSecret: process.env.TWITCH_CLIENT_SECRET ?? "",
      redirectUri: process.env.TWITCH_REDIRECT_URI ?? "",
      scopes: ["user:read:email", "channel:read:subscriptions", "moderator:read:chatters"],
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
      force_verify: "true",
    });
    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Twitch token exchange failed: ${err}`);
      throw new Error(`Twitch token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string[];
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope.join(" "),
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch("https://id.twitch.tv/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(`Twitch token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string[];
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope.join(" "),
    };
  }

  async revokeToken(token: string): Promise<void> {
    await fetch("https://id.twitch.tv/oauth2/revoke", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.clientId,
        token,
      }),
    });
  }

  async getUserInfo(accessToken: string): Promise<ConnectorUserInfo> {
    const response = await fetch("https://api.twitch.tv/helix/users", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Client-Id": this.config.clientId,
      },
    });

    if (!response.ok) {
      throw new Error(`Twitch getUserInfo failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      data: Array<{
        id: string;
        login: string;
        display_name: string;
        profile_image_url: string;
        email?: string;
      }>;
    };
    const user = body.data[0];
    if (!user) throw new Error("No user returned from Twitch");

    return {
      platformUserId: user.id,
      username: user.login,
      displayName: user.display_name,
      avatarUrl: user.profile_image_url,
      email: user.email ?? null,
    };
  }

  async validateToken(accessToken: string): Promise<boolean> {
    const response = await fetch("https://id.twitch.tv/oauth2/validate", {
      headers: { Authorization: `OAuth ${accessToken}` },
    });
    return response.ok;
  }
}
