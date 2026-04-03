import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "./jwt.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

/**
 * Injection token for the TenantResolverService.
 * Using a string token avoids a circular import between auth/ and modules/auth/.
 */
export const TENANT_RESOLVER = "TENANT_RESOLVER";

export interface TenantResolver {
  resolveBySubject(subject: string): Promise<{
    userId: string;
    tenantId: string;
    role: string;
    scopes: string[];
    roles: string[];
  } | null>;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
    @Optional() @Inject(TENANT_RESOLVER) private readonly tenantResolver?: TenantResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers["authorization"];
    if (!authHeader || typeof authHeader !== "string") {
      throw new UnauthorizedException("Missing authorization header");
    }

    const [scheme, token] = authHeader.split(" ");
    if (scheme?.toLowerCase() !== "bearer" || !token) {
      throw new UnauthorizedException("Invalid authorization scheme");
    }

    try {
      const payload = await this.jwtService.verify(token);
      request.user = payload;

      // If the token already has tenant_id (custom JWT or dev token), use it directly
      if (payload.tenant_id) {
        request.tenantId = payload.tenant_id;
        return true;
      }

      // Firebase ID tokens won't have tenant_id — resolve from DB
      if (payload.sub && this.tenantResolver) {
        const identity = await this.tenantResolver.resolveBySubject(payload.sub);
        if (identity) {
          // Enrich the payload with resolved claims
          payload.tenant_id = identity.tenantId;
          payload.scope = identity.scopes.join(" ");
          payload.roles = identity.roles;
          request.user = payload;
          request.tenantId = identity.tenantId;
          this.logger.debug(
            `Resolved tenant ${identity.tenantId} for subject ${payload.sub}`,
          );
        }
        // If identity is null, the user hasn't provisioned yet.
        // TenantGuard will catch the missing tenant_id and return 401.
      }

      return true;
    } catch (err) {
      this.logger.warn(
        `JWT verification failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
