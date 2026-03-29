import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { IS_PUBLIC_KEY } from "../auth/public.decorator.js";

@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest();

    // Prefer claim-based tenant resolution from JWT payload
    if (req.user?.tenant_id) {
      req.tenantId = req.user.tenant_id;
      return true;
    }

    // Fallback to header for backward compatibility during migration
    const headerTenantId = req.headers["x-tenant-id"];
    if (headerTenantId && typeof headerTenantId === "string") {
      req.tenantId = headerTenantId;
      return true;
    }

    throw new UnauthorizedException("Missing tenant context");
  }
}
