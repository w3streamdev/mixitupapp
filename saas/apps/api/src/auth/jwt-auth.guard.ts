import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { JwtService } from "./jwt.service.js";
import { IS_PUBLIC_KEY } from "./public.decorator.js";

@Injectable()
export class JwtAuthGuard implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
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
      request.tenantId = payload.tenant_id;
      return true;
    } catch (err) {
      this.logger.warn(
        `JWT verification failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
      throw new UnauthorizedException("Invalid or expired token");
    }
  }
}
