import { Global, Module } from "@nestjs/common";
import { AuthModule } from "../../auth/auth.module.js";
import { TENANT_RESOLVER } from "../../auth/jwt-auth.guard.js";
import { SignupController } from "./signup.controller.js";
import { TenantResolverService } from "./tenant-resolver.service.js";

@Global()
@Module({
  imports: [AuthModule],
  controllers: [SignupController],
  providers: [
    TenantResolverService,
    { provide: TENANT_RESOLVER, useExisting: TenantResolverService },
  ],
  exports: [TenantResolverService, TENANT_RESOLVER],
})
export class AuthUserModule {}
