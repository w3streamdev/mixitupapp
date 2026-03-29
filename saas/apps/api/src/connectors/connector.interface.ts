export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

export interface ConnectorUserInfo {
  platformUserId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  email: string | null;
}

export interface ConnectorConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface PlatformConnector {
  readonly platform: string;

  getAuthorizationUrl(state: string): string;

  exchangeCode(code: string): Promise<OAuthTokens>;

  refreshTokens(refreshToken: string): Promise<OAuthTokens>;

  revokeToken(token: string): Promise<void>;

  getUserInfo(accessToken: string): Promise<ConnectorUserInfo>;

  validateToken(accessToken: string): Promise<boolean>;
}
