import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from "class-validator";
import { Public } from "../../auth/public.decorator.js";
import { JwtService } from "../../auth/jwt.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

// ─── DTOs ───────────────────────────────────────────────────────────────────

export class ProvisionBody {
  @IsEmail()
  @IsNotEmpty()
  email!: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  displayName!: string;
}

export class TokenExchangeBody {
  @IsString()
  @IsNotEmpty()
  firebaseToken!: string;

  @IsString()
  @IsOptional()
  tenantId?: string;
}

// ─── Response shapes ────────────────────────────────────────────────────────

interface ProvisionResponse {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
  registered: boolean;
  message: string;
}

interface TokenInfoResponse {
  userId: string;
  tenantId: string;
  tenantSlug: string;
  role: string;
  scopes: string[];
}

// ─── Controller ─────────────────────────────────────────────────────────────

@ApiTags("auth")
@Controller("api/v2/auth")
export class SignupController {
  private readonly logger = new Logger(SignupController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly tenantResolver: TenantResolverService,
  ) {}

  /**
   * POST /api/v2/auth/provision
   *
   * Called after a user signs up via Firebase Auth on the client side.
   * Requires a valid Firebase ID token in the Authorization header.
   * Creates AppUser + Tenant + TenantMembership if they don't already exist.
   */
  @Post("provision")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Provision backend account after Firebase signup" })
  async provision(
    @Req() req: { user?: { sub?: string; email?: string; name?: string } },
    @Body() body: ProvisionBody,
  ): Promise<ProvisionResponse> {
    // req.user is set by JwtAuthGuard after verifying the Firebase ID token
    const subject = req.user?.sub;
    if (!subject) {
      throw new UnauthorizedException("Token must contain a subject (sub) claim");
    }

    const email = body.email || req.user?.email || "";
    const displayName = body.displayName || req.user?.name || "User";

    // Check if user already exists
    const existingUser = await this.prisma.appUser.findUnique({
      where: { subject },
      include: { memberships: { include: { tenant: true } } },
    });

    if (existingUser && existingUser.memberships.length > 0) {
      const membership = existingUser.memberships[0]!;
      this.logger.log(
        `User ${existingUser.id} already provisioned for tenant ${membership.tenantId}`,
      );
      return {
        userId: existingUser.id,
        tenantId: membership.tenantId,
        tenantSlug: membership.tenant.slug,
        role: membership.role,
        registered: false,
        message: "Account already provisioned.",
      };
    }

    // Create user + tenant + membership in a transaction
    const slug = this.generateSlug(displayName);

    const result = await this.prisma.$transaction(async (tx) => {
      // Create or update AppUser
      const user = await tx.appUser.upsert({
        where: { subject },
        create: {
          subject,
          email,
          displayName,
        },
        update: {
          email,
          displayName,
        },
      });

      // Create Tenant
      const tenant = await tx.tenant.create({
        data: {
          slug: await this.ensureUniqueSlug(tx, slug),
          name: `${displayName}'s Stream`,
        },
      });

      // Create TenantMembership with owner role
      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: tenant.id,
          userId: user.id,
          role: "owner",
        },
      });

      return { user, tenant, membership };
    });

    this.logger.log(
      `Provisioned user ${result.user.id} with tenant ${result.tenant.id} (slug: ${result.tenant.slug})`,
    );

    return {
      userId: result.user.id,
      tenantId: result.tenant.id,
      tenantSlug: result.tenant.slug,
      role: result.membership.role,
      registered: true,
      message: "Account created. Your tenant has been provisioned.",
    };
  }

  /**
   * POST /api/v2/auth/token-info
   *
   * Returns the user's resolved identity (tenant, scopes, roles) for
   * a verified Firebase token. Useful for the frontend to know what
   * the user has access to without decoding the token client-side.
   */
  @Post("token-info")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get resolved identity for the current token" })
  async tokenInfo(
    @Req() req: { user?: { sub?: string } },
  ): Promise<TokenInfoResponse> {
    const subject = req.user?.sub;
    if (!subject) {
      throw new UnauthorizedException("Token must contain a subject (sub) claim");
    }

    const identity = await this.tenantResolver.resolveBySubject(subject);
    if (!identity) {
      throw new UnauthorizedException(
        "User not provisioned. Call POST /api/v2/auth/provision first.",
      );
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: identity.tenantId },
    });

    return {
      userId: identity.userId,
      tenantId: identity.tenantId,
      tenantSlug: tenant?.slug ?? "",
      role: identity.role,
      scopes: identity.scopes,
    };
  }

  /**
   * POST /api/v2/auth/dev-token
   *
   * Development-only endpoint. Creates a dev JWT for testing when OIDC is not configured.
   * Returns a JWT-like base64 token that the dev-mode JwtService will accept.
   */
  @Public()
  @Post("dev-token")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Generate a dev token (development only)" })
  async devToken(
    @Body() body: ProvisionBody,
  ): Promise<{ token: string; userId: string; tenantId: string } | { error: string }> {
    // Only available when OIDC is not configured (dev mode)
    if (process.env.OIDC_ISSUER) {
      return { error: "Dev tokens are not available when OIDC is configured" };
    }

    const email = body.email;
    const displayName = body.displayName;
    const subject = `dev-${email}`;

    // Provision user if needed
    let user = await this.prisma.appUser.findUnique({
      where: { subject },
      include: { memberships: { include: { tenant: true } } },
    });

    if (!user || user.memberships.length === 0) {
      const slug = this.generateSlug(displayName);
      const result = await this.prisma.$transaction(async (tx) => {
        const u = await tx.appUser.upsert({
          where: { subject },
          create: { subject, email, displayName },
          update: { email, displayName },
        });

        const tenant = await tx.tenant.create({
          data: {
            slug: await this.ensureUniqueSlug(tx, slug),
            name: `${displayName}'s Stream`,
          },
        });

        await tx.tenantMembership.create({
          data: { tenantId: tenant.id, userId: u.id, role: "owner" },
        });

        return { user: u, tenant };
      });

      user = await this.prisma.appUser.findUnique({
        where: { id: result.user.id },
        include: { memberships: { include: { tenant: true } } },
      });
    }

    const membership = user!.memberships[0]!;

    // Build a dev JWT (unsigned, header.payload.signature format)
    const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        sub: subject,
        iss: "dev",
        aud: "dev",
        exp: Math.floor(Date.now() / 1000) + 86400, // 24 hours
        iat: Math.floor(Date.now() / 1000),
        tenant_id: membership.tenantId,
        scope: "commands:read commands:write counters:read counters:write currency:read currency:write inventory:read inventory:write users:read users:write webhooks:read webhooks:write migration:write settings:read settings:write",
        roles: ["owner"],
        email,
        name: displayName,
      }),
    ).toString("base64url");

    const token = `${header}.${payload}.dev`;

    this.logger.log(`Dev token generated for ${email} (tenant: ${membership.tenantId})`);

    return {
      token,
      userId: user!.id,
      tenantId: membership.tenantId,
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "stream";
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
