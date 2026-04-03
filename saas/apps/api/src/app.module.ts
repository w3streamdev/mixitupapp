import { Module } from "@nestjs/common";
import { APP_FILTER, APP_GUARD } from "@nestjs/core";
import { AuthModule } from "./auth/auth.module.js";
import { JwtAuthGuard } from "./auth/jwt-auth.guard.js";
import { ScopeGuard } from "./auth/scope.guard.js";
import { RolesGuard } from "./auth/roles.guard.js";
import { ConnectorsModule } from "./connectors/connectors.module.js";
import { GlobalExceptionFilter } from "./filters/http-exception.filter.js";
import { PrismaModule } from "./prisma/prisma.module.js";
import { AuthUserModule } from "./modules/auth/auth-user.module.js";
import { CommandsModule } from "./modules/commands/commands.module.js";
import { CountersModule } from "./modules/counters/counters.module.js";
import { CurrencyModule } from "./modules/currency/currency.module.js";
import { InventoryModule } from "./modules/inventory/inventory.module.js";
import { MigrationModule } from "./modules/migration/migration.module.js";
import { StatusModule } from "./modules/status/status.module.js";
import { UsersModule } from "./modules/users/users.module.js";
import { WebhooksModule } from "./modules/webhooks/webhooks.module.js";
import { TenantGuard } from "./tenancy/tenant.guard.js";
import { EventsModule } from "./events/events.module.js";
import { EventsTriggerModule } from "./modules/events/events-trigger.module.js";
import { TwitchAuthModule } from "./modules/auth/twitch-auth.module.js";
import { RedisModule } from "./redis/redis.module.js";

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    AuthModule,
    AuthUserModule,
    ConnectorsModule,
    EventsModule,
    EventsTriggerModule,
    TwitchAuthModule,
    StatusModule,
    CommandsModule,
    CountersModule,
    CurrencyModule,
    InventoryModule,
    MigrationModule,
    UsersModule,
    WebhooksModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: GlobalExceptionFilter },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_GUARD, useClass: ScopeGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
