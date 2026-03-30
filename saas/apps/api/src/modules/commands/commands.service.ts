import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service.js";

@Injectable()
export class CommandsService {
  constructor(private readonly prisma: PrismaService) {}

  async getById(tenantId: string, commandId: string) {
    const command = await this.prisma.command.findFirst({ where: { id: commandId, tenantId } });
    if (!command) throw new NotFoundException(`Command with ID '${commandId}' not found`);
    return command;
  }

  async list(tenantId: string, skip: number, pageSize: number) {
    const [totalCount, commands] = await this.prisma.$transaction([
      this.prisma.command.count({ where: { tenantId } }),
      this.prisma.command.findMany({
        where: { tenantId },
        orderBy: { id: "asc" },
        skip,
        take: pageSize,
      }),
    ]);
    return { totalCount, commands };
  }

  async updateState(tenantId: string, commandId: string, state: number) {
    const command = await this.getById(tenantId, commandId);
    let isEnabled: boolean;
    if (state === 0) isEnabled = false;
    else if (state === 1) isEnabled = true;
    else if (state === 2) isEnabled = !command.isEnabled;
    else throw new BadRequestException("Invalid command state option");

    return this.prisma.command.update({ where: { id: command.id }, data: { isEnabled } });
  }

  async enqueueRun(tenantId: string, commandId: string, payload: unknown) {
    await this.getById(tenantId, commandId);
    // TODO: Publish to Pub/Sub for async execution
    return { accepted: true, tenantId, commandId, payload };
  }
}
