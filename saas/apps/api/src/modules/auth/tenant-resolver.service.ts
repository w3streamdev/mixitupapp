import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

export interface ResolvedIdentity {
  userId: string;
  tenantId: string;
  role: string;
  scopes: string[];
  roles: string[];
}

/** Default scopes assigned based on membership role */
const DEFAULT_SCOPES_BY_ROLE: Record<string, string[]> = {
  owner: [
    "commands:read",
    "commands:write",
    "counters:read",
    "counters:write",
    "currency:read",
    "currency:write",
    "inventory:read",
    "inventory:write",
    "users:read",
    "users:write",
    "webhooks:read",
    "webhooks:write",
    "migration:write",
    "settings:read",
    "settings:write",
  ],
  admin: [
    "commands:read",
    "commands:write",
    "counters:read",
    "counters:write",
    "currency:read",
    "currency:write",
    "inventory:read",
    "inventory:write",
    "users:read",
    "users:write",
    "webhooks:read",
    "webhooks:write",
    "settings:read",
  ],
  editor: [
    "commands:read",
    "commands:write",
    "counters:read",
    "counters:write",
    "currency:read",
    "inventory:read",
    "users:read",
  ],
  viewer: ["commands:read", "counters:read", "currency:read", "inventory:read", "users:read"],
};

@Injectable()
export class TenantResolverService {
  private readonly logger = new Logger(TenantResolverService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Given a Firebase/OIDC subject (uid), look up the user's tenant membership
   * and return identity details including tenant_id, scopes, and roles.
   * Returns null if the user has not been provisioned yet.
   */
  async resolveBySubject(subject: string): Promise<ResolvedIdentity | null> {
    const user = await this.prisma.appUser.findUnique({
      where: { subject },
      include: {
        memberships: {
          include: { tenant: true },
          take: 1, // For now, users have one tenant; multi-tenant selection comes later
        },
      },
    });

    if (!user) {
      this.logger.debug(`No AppUser found for subject ${subject}`);
      return null;
    }

    const membership = user.memberships[0];
    if (!membership) {
      this.logger.debug(`AppUser ${user.id} has no tenant membership`);
      return null;
    }

    const role = membership.role;
    const scopes = DEFAULT_SCOPES_BY_ROLE[role] ?? DEFAULT_SCOPES_BY_ROLE["viewer"]!;

    return {
      userId: user.id,
      tenantId: membership.tenantId,
      role,
      scopes,
      roles: [role],
    };
  }
}
