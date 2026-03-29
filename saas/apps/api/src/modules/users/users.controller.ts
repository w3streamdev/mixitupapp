import { Body, Controller, Delete, Get, Param, Post, Query } from "@nestjs/common";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { NewUserBody } from "./dto/new-user.body.js";
import { GetListUsersQuery } from "./dto/get-list-users.query.js";
import { UsersService } from "./users.service.js";

@Controller("api/v2/users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get(":userId")
  async getById(@TenantContext() ctx: { tenantId: string }, @Param("userId") userId: string) {
    const user = await this.usersService.getById(ctx.tenantId, userId);
    return { User: this.toContract(user) };
  }

  @Get()
  async list(@TenantContext() ctx: { tenantId: string }, @Query() query: GetListUsersQuery) {
    const result = await this.usersService.list(ctx.tenantId, query.skip, query.pageSize);
    return { TotalCount: result.totalCount, Users: result.users.map((u) => this.toContract(u)) };
  }

  @Post("add")
  async add(@TenantContext() ctx: { tenantId: string }, @Body() body: NewUserBody) {
    const user = await this.usersService.addByPlatformUsername(ctx.tenantId, body.Platform, body.Username);
    return { User: this.toContract(user) };
  }

  @Delete(":userId")
  async deleteById(@TenantContext() ctx: { tenantId: string }, @Param("userId") userId: string) {
    return this.usersService.deleteById(ctx.tenantId, userId);
  }

  private toContract(user: any) {
    return {
      ID: user.id,
      LastActivity: user.lastActivity,
      LastUpdated: user.lastUpdated,
      OnlineViewingMinutes: user.onlineViewingMinutes,
      CustomTitle: user.customTitle,
      IsSpecialtyExcluded: user.isSpecialtyExcluded,
      Notes: user.notes,
      PlatformData: {
        [user.platform]: {
          Platform: user.platform,
          ID: user.platformUserId,
          Username: user.username,
          DisplayName: user.displayName,
          AvatarLink: user.avatarLink,
          SubscriberBadgeLink: user.subscriberBadgeLink,
          RoleBadgeLink: user.roleBadgeLink,
          SpecialtyBadgeLink: user.specialtyBadgeLink,
          Roles: [],
        },
      },
    };
  }
}
