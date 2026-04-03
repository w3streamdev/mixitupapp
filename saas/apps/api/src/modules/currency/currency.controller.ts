import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { CurrencyService } from "./currency.service.js";
import { CreateCurrencyBody } from "./dto/create-currency.body.js";
import { AdjustBalanceBody } from "./dto/adjust-balance.body.js";
import { GetListCurrencyQuery } from "./dto/get-list-currency.query.js";

@ApiTags("Currency")
@Controller("api/v2/currency")
export class CurrencyController {
  constructor(private readonly currencyService: CurrencyService) {}

  @Get()
  @RequireScopes("currency:read")
  async list(@TenantContext() ctx: { tenantId: string }, @Query() query: GetListCurrencyQuery) {
    const result = await this.currencyService.list(ctx.tenantId, query.skip, query.pageSize);
    return {
      TotalCount: result.totalCount,
      Currencies: result.currencies.map((c) => ({
        ID: c.id,
        Name: c.name,
        AcquireAmount: c.acquireAmount,
        AcquireInterval: c.acquireInterval,
        MaxAmount: c.maxAmount,
        IsEnabled: c.isEnabled,
      })),
    };
  }

  @Get(":currencyId")
  @RequireScopes("currency:read")
  async getById(
    @TenantContext() ctx: { tenantId: string },
    @Param("currencyId") currencyId: string,
  ) {
    const currency = await this.currencyService.getById(ctx.tenantId, currencyId);
    return {
      Currency: {
        ID: currency.id,
        Name: currency.name,
        AcquireAmount: currency.acquireAmount,
        AcquireInterval: currency.acquireInterval,
        MaxAmount: currency.maxAmount,
        IsEnabled: currency.isEnabled,
      },
    };
  }

  @Post()
  @RequireScopes("currency:write")
  async create(@TenantContext() ctx: { tenantId: string }, @Body() body: CreateCurrencyBody) {
    const currency = await this.currencyService.create(ctx.tenantId, body);
    return {
      Currency: {
        ID: currency.id,
        Name: currency.name,
        AcquireAmount: currency.acquireAmount,
        AcquireInterval: currency.acquireInterval,
        MaxAmount: currency.maxAmount,
        IsEnabled: currency.isEnabled,
      },
    };
  }

  @Get(":currencyId/user/:userId")
  @RequireScopes("currency:read")
  async getUserBalance(
    @TenantContext() ctx: { tenantId: string },
    @Param("currencyId") currencyId: string,
    @Param("userId") userId: string,
  ) {
    const balance = await this.currencyService.getUserBalance(ctx.tenantId, currencyId, userId);
    return { Balance: balance };
  }

  @Patch(":currencyId/user/:userId/adjust")
  @RequireScopes("currency:write")
  async adjustBalance(
    @TenantContext() ctx: { tenantId: string },
    @Param("currencyId") currencyId: string,
    @Param("userId") userId: string,
    @Body() body: AdjustBalanceBody,
  ) {
    const balance = await this.currencyService.adjustBalance(
      ctx.tenantId,
      currencyId,
      userId,
      body.amount,
      body.reason,
    );
    return { Balance: balance };
  }

  @Delete(":currencyId")
  @RequireScopes("currency:write")
  async remove(
    @TenantContext() ctx: { tenantId: string },
    @Param("currencyId") currencyId: string,
  ) {
    await this.currencyService.remove(ctx.tenantId, currencyId);
    return { success: true };
  }
}
