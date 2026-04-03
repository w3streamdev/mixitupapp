import { describe, it, expect, beforeEach, vi } from "vitest";
import { JwtService } from "./jwt.service.js";

describe("JwtService", () => {
  let service: JwtService;

  beforeEach(() => {
    service = new JwtService();
    vi.stubEnv("OIDC_ISSUER", "");
    vi.stubEnv("OIDC_AUDIENCE", "");
    vi.stubEnv("OIDC_JWKS_URI", "");
    service.onModuleInit();
  });

  it("should reject tokens with invalid format", async () => {
    await expect(service.verify("invalid")).rejects.toThrow("Invalid JWT format");
  });

  it("should reject tokens with only two parts", async () => {
    await expect(service.verify("a.b")).rejects.toThrow("Invalid JWT format");
  });

  it("should parse valid JWT payload in dev mode", async () => {
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: "user-1",
        iss: "test",
        aud: "test",
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
        tenant_id: "tenant-1",
        scope: "commands:read users:read",
        roles: ["admin"],
      }),
    ).toString("base64url");
    const signature = Buffer.from("fake-sig").toString("base64url");

    const result = await service.verify(`${header}.${payload}.${signature}`);

    expect(result.sub).toBe("user-1");
    expect(result.tenant_id).toBe("tenant-1");
    expect(result.scope).toBe("commands:read users:read");
    expect(result.roles).toEqual(["admin"]);
  });
});
