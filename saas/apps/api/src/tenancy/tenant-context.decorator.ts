import { createParamDecorator, ExecutionContext } from "@nestjs/common";

export const TenantContext = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest();
  if (!request.tenantId) {
    throw new Error("tenant context missing");
  }
  return { tenantId: request.tenantId as string };
});
