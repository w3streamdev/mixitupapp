import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async getById(tenantId: string, userId: string) {
    const user = await this.prisma.tenantUser.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new NotFoundException(`User with ID '${userId}' not found`);
    return user;
  }

  async list(tenantId: string, skip: number, pageSize: number) {
    const [totalCount, users] = await this.prisma.$transaction([
      this.prisma.tenantUser.count({ where: { tenantId } }),
      this.prisma.tenantUser.findMany({ where: { tenantId }, orderBy: { id: "asc" }, skip, take: pageSize }),
    ]);
    return { totalCount, users };
  }

  async addByPlatformUsername(tenantId: string, platform: string, username: string) {
    return this.prisma.tenantUser.create({
      data: {
        tenantId,
        platform,
        username,
        displayName: username,
      },
    });
  }

  async deleteById(tenantId: string, userId: string) {
    const user = await this.getById(tenantId, userId);
    await this.prisma.tenantUser.delete({ where: { id: user.id } });
    return { success: true };
  }
}
