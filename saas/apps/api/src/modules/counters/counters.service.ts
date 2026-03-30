import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class CountersService {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, skip: number, pageSize: number) {
    const [totalCount, counters] = await this.prisma.$transaction([
      this.prisma.counter.count({ where: { tenantId } }),
      this.prisma.counter.findMany({
        where: { tenantId },
        orderBy: { name: "asc" },
        skip,
        take: pageSize,
      }),
    ]);
    return { totalCount, counters };
  }

  async getById(tenantId: string, counterId: string) {
    const counter = await this.prisma.counter.findFirst({
      where: { id: counterId, tenantId },
    });
    if (!counter) throw new NotFoundException(`Counter '${counterId}' not found`);
    return counter;
  }

  async create(tenantId: string, data: { name: string; amount?: number; resetAmount?: number }) {
    return this.prisma.counter.create({
      data: {
        tenantId,
        name: data.name,
        amount: data.amount ?? 0,
        resetAmount: data.resetAmount ?? 0,
      },
    });
  }

  async update(
    tenantId: string,
    counterId: string,
    data: { name?: string; amount?: number; resetAmount?: number },
  ) {
    await this.getById(tenantId, counterId);
    return this.prisma.counter.update({
      where: { id: counterId },
      data,
    });
  }

  async increment(tenantId: string, counterId: string, amount: number) {
    await this.getById(tenantId, counterId);
    return this.prisma.counter.update({
      where: { id: counterId },
      data: { amount: { increment: amount } },
    });
  }

  async reset(tenantId: string, counterId: string) {
    const counter = await this.getById(tenantId, counterId);
    return this.prisma.counter.update({
      where: { id: counterId },
      data: { amount: counter.resetAmount },
    });
  }

  async remove(tenantId: string, counterId: string) {
    await this.getById(tenantId, counterId);
    await this.prisma.counter.delete({ where: { id: counterId } });
  }
}
