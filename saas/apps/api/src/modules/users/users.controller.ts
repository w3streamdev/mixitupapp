import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { NewUserBody } from "./dto/new-user.body.js";
import { GetListUsersQuery } from "./dto/get-list-users.query.js";
import { UsersService } from "./users.service.js";
import type { TenantUserContract, TenantUserPlatformData } from "./users.types.js";

interface TenantUserRow {
  id: string;
  platform: string;
  platformUserId: string | null;
  username: string | null;
  displayName: string | null;
  avatarLink: string | null;
  subscriberBadgeLink: string | null;
  roleBadgeLink: string | null;
  specialtyBadgeLink: string | null;
  lastActivity: Date | null;
  lastUpdated: Date | null;
  onlineViewingMinutes: number;
  customTitle: string | null;
  isSpecialtyExcluded: boolean;
  notes: string | null;
}

@ApiTags("Users")
@Controller("api/v2/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(":userId")
  @RequireScopes("users:read")
  async getById(@TenantContext() ctx: { tenantId: string }, @Param("userId") userId: string) {
    const user = await this.usersService.getById(ctx.tenantId, userId);
    return { User: this.toContract(user) };
  }

  @Get()
  @RequireScopes("users:read")
  async list(@TenantContext() ctx: { tenantId: string }, @Query() query: GetListUsersQuery) {
    const result = await this.usersService.list(ctx.tenantId, query.skip, query.pageSize);
    return {
      TotalCount: result.totalCount,
      Users: result.users.map((u) => this.toContract(u)),
    };
  }

  @Post("add")
  @RequireScopes("users:write")
  async add(@TenantContext() ctx: { tenantId: string }, @Body() body: NewUserBody) {
    const user = await this.usersService.addByPlatformUsername(
      ctx.tenantId,
      body.Platform,
      body.Username,
    );
    return { User: this.toContract(user) };
  }

  @Delete(":userId")
  @RequireScopes("users:write")
  async deleteById(@TenantContext() ctx: { tenantId: string }, @Param("userId") userId: string) {
    return this.usersService.deleteById(ctx.tenantId, userId);
  }

  private toContract(user: TenantUserRow): TenantUserContract {
    const platformData: TenantUserPlatformData = {
      Platform: user.platform,
      ID: user.platformUserId,
      Username: user.username,
      DisplayName: user.displayName,
      AvatarLink: user.avatarLink,
      SubscriberBadgeLink: user.subscriberBadgeLink,
      RoleBadgeLink: user.roleBadgeLink,
      SpecialtyBadgeLink: user.specialtyBadgeLink,
      Roles: [],
    };

    return {
      ID: user.id,
      LastActivity: user.lastActivity,
      LastUpdated: user.lastUpdated,
      OnlineViewingMinutes: user.onlineViewingMinutes,
      CustomTitle: user.customTitle,
      IsSpecialtyExcluded: user.isSpecialtyExcluded,
      Notes: user.notes,
      PlatformData: { [user.platform]: platformData },
    };
  }
}
