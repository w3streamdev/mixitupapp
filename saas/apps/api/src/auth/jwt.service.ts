import type { OnModuleInit } from "@nestjs/common";
import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "node:crypto";

export interface JwtPayload {
  sub: string;
  iss: string;
  aud: string | string[];
  exp: number;
  iat: number;
  tenant_id: string;
  scope?: string;
  roles?: string[];
  email?: string;
  name?: string;
}

interface JwksKey {
  kty: string;
  kid: string;
  use: string;
  alg: string;
  n: string;
  e: string;
}

interface JwksResponse {
  keys: JwksKey[];
}

@Injectable()
export class JwtService implements OnModuleInit {
  private readonly logger = new Logger(JwtService.name);
  private jwksUri = "";
  private issuer = "";
  private audience = "";
  private keyCache = new Map<string, crypto.KeyObject>();
  private lastFetch = 0;
  private readonly cacheTtlMs = 3600_000; // 1 hour

  onModuleInit(): void {
    this.issuer = process.env.OIDC_ISSUER ?? "";
    this.audience = process.env.OIDC_AUDIENCE ?? "";
    this.jwksUri = process.env.OIDC_JWKS_URI ?? "";

    if (!this.issuer) {
      this.logger.warn("OIDC_ISSUER not set — JWT verification will be skipped in development");
    }
  }

  async verify(token: string): Promise<JwtPayload> {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new Error("Invalid JWT format");
    }

    const header = JSON.parse(Buffer.from(parts[0]!, "base64url").toString()) as {
      alg: string;
      kid?: string;
      typ?: string;
    };
    const payload = JSON.parse(Buffer.from(parts[1]!, "base64url").toString()) as JwtPayload;

    // In development without OIDC config, trust the payload but log a warning
    if (!this.issuer) {
      this.logger.warn("JWT verification skipped — OIDC not configured");
      return payload;
    }

    // Validate claims
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      throw new Error("Token expired");
    }
    if (payload.iss !== this.issuer) {
      throw new Error(`Invalid issuer: expected ${this.issuer}, got ${payload.iss}`);
    }
    if (this.audience) {
      const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
      if (!aud.includes(this.audience)) {
        throw new Error(`Invalid audience: expected ${this.audience}`);
      }
    }

    // Verify signature
    if (header.kid && this.jwksUri) {
      const key = await this.getKey(header.kid);
      const signatureInput = `${parts[0]}.${parts[1]}`;
      const signature = Buffer.from(parts[2]!, "base64url");

      const alg = header.alg === "RS256" ? "SHA256" : "SHA384";
      const isValid = crypto.createVerify(alg).update(signatureInput).verify(key, signature);
      if (!isValid) {
        throw new Error("Invalid JWT signature");
      }
    }

    return payload;
  }

  private async getKey(kid: string): Promise<crypto.KeyObject> {
    const cached = this.keyCache.get(kid);
    if (cached && Date.now() - this.lastFetch < this.cacheTtlMs) {
      return cached;
    }

    await this.refreshKeys();
    const key = this.keyCache.get(kid);
    if (!key) {
      throw new Error(`Unknown key ID: ${kid}`);
    }
    return key;
  }

  private async refreshKeys(): Promise<void> {
    if (!this.jwksUri) return;

    try {
      const response = await fetch(this.jwksUri);
      if (!response.ok) {
        throw new Error(`JWKS fetch failed: ${response.status}`);
      }
      const jwks = (await response.json()) as JwksResponse;

      this.keyCache.clear();
      for (const key of jwks.keys) {
        if (key.kty === "RSA" && key.use === "sig") {
          const keyObject = crypto.createPublicKey({
            key: {
              kty: key.kty,
              n: key.n,
              e: key.e,
            },
            format: "jwk",
          });
          this.keyCache.set(key.kid, keyObject);
        }
      }
      this.lastFetch = Date.now();
      this.logger.log(`JWKS refreshed: ${this.keyCache.size} keys loaded`);
    } catch (err) {
      this.logger.error("Failed to refresh JWKS", err instanceof Error ? err.message : err);
      throw err;
    }
  }
}
