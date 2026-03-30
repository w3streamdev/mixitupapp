import { Injectable, Logger } from "@nestjs/common";
import type {
  PlatformConnector,
  ConnectorConfig,
  OAuthTokens,
  ConnectorUserInfo,
} from "./connector.interface.js";

@Injectable()
export class YouTubeConnector implements PlatformConnector {
  readonly platform = "YouTube";
  private readonly logger = new Logger(YouTubeConnector.name);
  private readonly config: ConnectorConfig;

  constructor() {
    this.config = {
      clientId: process.env.YOUTUBE_CLIENT_ID ?? "",
      clientSecret: process.env.YOUTUBE_CLIENT_SECRET ?? "",
      redirectUri: process.env.YOUTUBE_REDIRECT_URI ?? "",
      scopes: [
        "https://www.googleapis.com/auth/youtube.readonly",
        "https://www.googleapis.com/auth/youtube.force-ssl",
      ],
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join(" "),
      state,
      access_type: "offline",
      prompt: "consent",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
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
      this.logger.error(`YouTube token exchange failed: ${err}`);
      throw new Error(`YouTube token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch("https://oauth2.googleapis.com/token", {
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
      throw new Error(`YouTube token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
      scope: string;
    };

    return {
      accessToken: data.access_token,
      refreshToken, // Google doesn't always return a new refresh token
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: data.scope,
    };
  }

  async revokeToken(token: string): Promise<void> {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    });
  }

  async getUserInfo(accessToken: string): Promise<ConnectorUserInfo> {
    const response = await fetch(
      "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );

    if (!response.ok) {
      throw new Error(`YouTube getUserInfo failed: ${response.status}`);
    }

    const body = (await response.json()) as {
      items: Array<{
        id: string;
        snippet: {
          title: string;
          customUrl?: string;
          thumbnails: { default?: { url: string } };
        };
      }>;
    };

    const channel = body.items[0];
    if (!channel) throw new Error("No YouTube channel found");

    return {
      platformUserId: channel.id,
      username: channel.snippet.customUrl ?? channel.snippet.title,
      displayName: channel.snippet.title,
      avatarUrl: channel.snippet.thumbnails.default?.url ?? null,
      email: null,
    };
  }

  async validateToken(accessToken: string): Promise<boolean> {
    const response = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`,
    );
    return response.ok;
  }
}
