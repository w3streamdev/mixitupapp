import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { InventoryService } from "./inventory.service.js";
import { CreateInventoryBody } from "./dto/create-inventory.body.js";
import { CreateItemBody } from "./dto/create-item.body.js";
import { AdjustItemBody } from "./dto/adjust-item.body.js";
import { GetListInventoryQuery } from "./dto/get-list-inventory.query.js";

@ApiTags("Inventory")
@Controller("api/v2/inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  @RequireScopes("inventory:read")
  async list(@TenantContext() ctx: { tenantId: string }, @Query() query: GetListInventoryQuery) {
    const result = await this.inventoryService.list(ctx.tenantId, query.skip, query.pageSize);
    return {
      TotalCount: result.totalCount,
      Inventories: result.inventories.map((inv) => ({
        ID: inv.id,
        Name: inv.name,
        DefaultMaxAmount: inv.defaultMaxAmount,
        ShopEnabled: inv.shopEnabled,
        ShopCurrencyId: inv.shopCurrencyId,
      })),
    };
  }

  @Get(":inventoryId")
  @RequireScopes("inventory:read")
  async getById(
    @TenantContext() ctx: { tenantId: string },
    @Param("inventoryId") inventoryId: string,
  ) {
    const inv = await this.inventoryService.getById(ctx.tenantId, inventoryId);
    return {
      Inventory: {
        ID: inv.id,
        Name: inv.name,
        DefaultMaxAmount: inv.defaultMaxAmount,
        ShopEnabled: inv.shopEnabled,
        ShopCurrencyId: inv.shopCurrencyId,
      },
    };
  }

  @Post()
  @RequireScopes("inventory:write")
  async create(@TenantContext() ctx: { tenantId: string }, @Body() body: CreateInventoryBody) {
    const inv = await this.inventoryService.create(ctx.tenantId, body);
    return {
      Inventory: {
        ID: inv.id,
        Name: inv.name,
        DefaultMaxAmount: inv.defaultMaxAmount,
        ShopEnabled: inv.shopEnabled,
        ShopCurrencyId: inv.shopCurrencyId,
      },
    };
  }

  @Delete(":inventoryId")
  @RequireScopes("inventory:write")
  async remove(
    @TenantContext() ctx: { tenantId: string },
    @Param("inventoryId") inventoryId: string,
  ) {
    await this.inventoryService.remove(ctx.tenantId, inventoryId);
    return { success: true };
  }

  // Inventory Items
  @Get(":inventoryId/items")
  @RequireScopes("inventory:read")
  async listItems(
    @TenantContext() ctx: { tenantId: string },
    @Param("inventoryId") inventoryId: string,
    @Query() query: GetListInventoryQuery,
  ) {
    const result = await this.inventoryService.listItems(
      ctx.tenantId,
      inventoryId,
      query.skip,
      query.pageSize,
    );
    return {
      TotalCount: result.totalCount,
      Items: result.items.map((item) => ({
        ID: item.id,
        Name: item.name,
        MaxAmount: item.maxAmount,
        ShopBuyPrice: item.shopBuyPrice,
        ShopSellPrice: item.shopSellPrice,
      })),
    };
  }

  @Post(":inventoryId/items")
  @RequireScopes("inventory:write")
  async createItem(
    @TenantContext() ctx: { tenantId: string },
    @Param("inventoryId") inventoryId: string,
    @Body() body: CreateItemBody,
  ) {
    const item = await this.inventoryService.createItem(ctx.tenantId, inventoryId, body);
    return {
      Item: {
        ID: item.id,
        Name: item.name,
        MaxAmount: item.maxAmount,
        ShopBuyPrice: item.shopBuyPrice,
        ShopSellPrice: item.shopSellPrice,
      },
    };
  }

  @Patch(":inventoryId/items/:itemId/user/:userId/adjust")
  @RequireScopes("inventory:write")
  async adjustUserItem(
    @TenantContext() ctx: { tenantId: string },
    @Param("inventoryId") inventoryId: string,
    @Param("itemId") itemId: string,
    @Param("userId") userId: string,
    @Body() body: AdjustItemBody,
  ) {
    const ledger = await this.inventoryService.adjustUserItem(
      ctx.tenantId,
      inventoryId,
      itemId,
      userId,
      body.amount,
    );
    return { Amount: ledger.amount };
  }

  @Get(":inventoryId/items/:itemId/user/:userId")
  @RequireScopes("inventory:read")
  async getUserItem(
    @TenantContext() ctx: { tenantId: string },
    @Param("inventoryId") inventoryId: string,
    @Param("itemId") itemId: string,
    @Param("userId") userId: string,
  ) {
    const amount = await this.inventoryService.getUserItemAmount(
      ctx.tenantId,
      inventoryId,
      itemId,
      userId,
    );
    return { Amount: amount };
  }
}
