import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

@Injectable()
export class TenantGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const tenantId = req.headers["x-tenant-id"];
    if (!tenantId || typeof tenantId !== "string") {
      throw new UnauthorizedException("Missing tenant context");
    }
    req.tenantId = tenantId;
    return true;
  }
}
