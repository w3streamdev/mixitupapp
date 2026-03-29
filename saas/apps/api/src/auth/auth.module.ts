import { Module } from "@nestjs/common";
import { JwtAuthGuard } from "./jwt-auth.guard.js";
import { ScopeGuard } from "./scope.guard.js";
import { RolesGuard } from "./roles.guard.js";
import { JwtService } from "./jwt.service.js";

@Module({
  providers: [JwtService, JwtAuthGuard, ScopeGuard, RolesGuard],
  exports: [JwtService, JwtAuthGuard, ScopeGuard, RolesGuard],
})
export class AuthModule {}
