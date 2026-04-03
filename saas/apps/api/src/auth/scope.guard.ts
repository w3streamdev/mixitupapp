import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_SCOPES_KEY } from "./scopes.decorator.js";
import type { JwtPayload } from "./jwt.service.js";

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(
      REQUIRED_SCOPES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredScopes || requiredScopes.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload | undefined;
    if (!user) {
      throw new ForbiddenException("No authenticated user");
    }

    const tokenScopes = (user.scope ?? "").split(" ").filter(Boolean);
    const hasAll = requiredScopes.every((s) => tokenScopes.includes(s));
    if (!hasAll) {
      throw new ForbiddenException(
        `Missing required scope(s): ${requiredScopes.filter((s) => !tokenScopes.includes(s)).join(", ")}`,
      );
    }
    return true;
  }
}
