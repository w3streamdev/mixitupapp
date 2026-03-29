import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { PrismaClient } from "@prisma/client";
import { CommandsModule } from "./modules/commands/commands.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { TenantGuard } from "./tenancy/tenant.guard.js";

@Module({
  imports: [CommandsModule, UsersModule],
  providers: [
    PrismaClient,
    {
      provide: APP_GUARD,
      useClass: TenantGuard,
    },
  ],
})
export class AppModule {}
