import { Injectable, Logger } from "@nestjs/common";
import type {
  PlatformConnector,
  ConnectorConfig,
  OAuthTokens,
  ConnectorUserInfo,
} from "./connector.interface.js";

@Injectable()
export class TrovoConnector implements PlatformConnector {
  readonly platform = "Trovo";
  private readonly logger = new Logger(TrovoConnector.name);
  private readonly config: ConnectorConfig;

  constructor() {
    this.config = {
      clientId: process.env.TROVO_CLIENT_ID ?? "",
      clientSecret: process.env.TROVO_CLIENT_SECRET ?? "",
      redirectUri: process.env.TROVO_REDIRECT_URI ?? "",
      scopes: ["user_details_self", "channel_details_self", "chat_send_self"],
    };
  }

  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope: this.config.scopes.join("+"),
      state,
    });
    return `https://open.trovo.live/page/login.html?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const response = await fetch("https://open-api.trovo.live/openplatform/exchangetoken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-ID": this.config.clientId,
      },
      body: JSON.stringify({
        client_secret: this.config.clientSecret,
        grant_type: "authorization_code",
        code,
        redirect_uri: this.config.redirectUri,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      this.logger.error(`Trovo token exchange failed: ${err}`);
      throw new Error(`Trovo token exchange failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: this.config.scopes.join(" "),
    };
  }

  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch("https://open-api.trovo.live/openplatform/refreshtoken", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-ID": this.config.clientId,
      },
      body: JSON.stringify({
        client_secret: this.config.clientSecret,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      throw new Error(`Trovo token refresh failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
      scope: this.config.scopes.join(" "),
    };
  }

  async revokeToken(token: string): Promise<void> {
    await fetch("https://open-api.trovo.live/openplatform/revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-ID": this.config.clientId,
      },
      body: JSON.stringify({ access_token: token }),
    });
  }

  async getUserInfo(accessToken: string): Promise<ConnectorUserInfo> {
    const response = await fetch("https://open-api.trovo.live/openplatform/getuserinfo", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-ID": this.config.clientId,
        Authorization: `OAuth ${accessToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Trovo getUserInfo failed: ${response.status}`);
    }

    const data = (await response.json()) as {
      userId: string;
      userName: string;
      nickName: string;
      profilePic: string;
      email?: string;
    };

    return {
      platformUserId: data.userId,
      username: data.userName,
      displayName: data.nickName,
      avatarUrl: data.profilePic || null,
      email: data.email ?? null,
    };
  }

  async validateToken(accessToken: string): Promise<boolean> {
    const response = await fetch("https://open-api.trovo.live/openplatform/validate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-ID": this.config.clientId,
        Authorization: `OAuth ${accessToken}`,
      },
    });
    return response.ok;
  }
}
