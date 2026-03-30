import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { RequireScopes } from "../../auth/scopes.decorator.js";
import { TenantContext } from "../../tenancy/tenant-context.decorator.js";
import { CountersService } from "./counters.service.js";
import { CreateCounterBody } from "./dto/create-counter.body.js";
import { UpdateCounterBody } from "./dto/update-counter.body.js";
import { GetListCountersQuery } from "./dto/get-list-counters.query.js";

@ApiTags("Counters")
@Controller("api/v2/counters")
export class CountersController {
  constructor(private readonly countersService: CountersService) {}

  @Get()
  @RequireScopes("counters:read")
  async list(@TenantContext() ctx: { tenantId: string }, @Query() query: GetListCountersQuery) {
    const result = await this.countersService.list(ctx.tenantId, query.skip, query.pageSize);
    return {
      TotalCount: result.totalCount,
      Counters: result.counters.map((c) => ({
        ID: c.id,
        Name: c.name,
        Amount: c.amount,
        ResetAmount: c.resetAmount,
      })),
    };
  }

  @Get(":counterId")
  @RequireScopes("counters:read")
  async getById(
    @TenantContext() ctx: { tenantId: string },
    @Param("counterId") counterId: string,
  ) {
    const counter = await this.countersService.getById(ctx.tenantId, counterId);
    return {
      Counter: {
        ID: counter.id,
        Name: counter.name,
        Amount: counter.amount,
        ResetAmount: counter.resetAmount,
      },
    };
  }

  @Post()
  @RequireScopes("counters:write")
  async create(@TenantContext() ctx: { tenantId: string }, @Body() body: CreateCounterBody) {
    const counter = await this.countersService.create(ctx.tenantId, body);
    return {
      Counter: {
        ID: counter.id,
        Name: counter.name,
        Amount: counter.amount,
        ResetAmount: counter.resetAmount,
      },
    };
  }

  @Patch(":counterId")
  @RequireScopes("counters:write")
  async update(
    @TenantContext() ctx: { tenantId: string },
    @Param("counterId") counterId: string,
    @Body() body: UpdateCounterBody,
  ) {
    const counter = await this.countersService.update(ctx.tenantId, counterId, body);
    return {
      Counter: {
        ID: counter.id,
        Name: counter.name,
        Amount: counter.amount,
        ResetAmount: counter.resetAmount,
      },
    };
  }

  @Patch(":counterId/increment/:amount")
  @RequireScopes("counters:write")
  async increment(
    @TenantContext() ctx: { tenantId: string },
    @Param("counterId") counterId: string,
    @Param("amount") amount: string,
  ) {
    const counter = await this.countersService.increment(ctx.tenantId, counterId, Number(amount));
    return { Counter: { ID: counter.id, Name: counter.name, Amount: counter.amount } };
  }

  @Patch(":counterId/reset")
  @RequireScopes("counters:write")
  async reset(@TenantContext() ctx: { tenantId: string }, @Param("counterId") counterId: string) {
    const counter = await this.countersService.reset(ctx.tenantId, counterId);
    return { Counter: { ID: counter.id, Name: counter.name, Amount: counter.amount } };
  }

  @Delete(":counterId")
  @RequireScopes("counters:write")
  async remove(@TenantContext() ctx: { tenantId: string }, @Param("counterId") counterId: string) {
    await this.countersService.remove(ctx.tenantId, counterId);
    return { success: true };
  }
}
