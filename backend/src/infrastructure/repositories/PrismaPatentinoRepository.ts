import { PrismaClient } from '@prisma/client';
import { Patentino } from '../../domain/entities/Patentino';
import { IPatentinoRepository } from '../../domain/repositories/IPatentinoRepository';

export class PrismaPatentinoRepository implements IPatentinoRepository {
  constructor(private prisma: PrismaClient) {}

  async create(patentino: Patentino): Promise<Patentino> {
    const created = await this.prisma.patentino.create({
      data: {
        id: patentino.id,
        type: patentino.type,
        code: patentino.code,
        expiresAt: patentino.expiresAt,
        releaseAt: patentino.releaseAt,
        isActive: patentino.isActive,
        createdAt: patentino.createdAt,
        updatedAt: patentino.updatedAt,
        userId: patentino.userId,
      },
    });
    return Patentino.fromPrisma(created);
  }

  async findById(id: string): Promise<Patentino | null> {
    const found = await this.prisma.patentino.findUnique({ where: { id } });
    if (!found) return null;
    return Patentino.fromPrisma(found);
  }

  async findByCode(code: string): Promise<Patentino | null> {
    const found = await this.prisma.patentino.findUnique({ where: { code } });
    if (!found) return null;
    return Patentino.fromPrisma(found);
  }

  async findManyByUserId(userId: string): Promise<Patentino[]> {
    const list = await this.prisma.patentino.findMany({ where: { userId } });
    return list.map(Patentino.fromPrisma);
  }

  async update(id: string, data: Partial<Patentino>): Promise<Patentino> {
    const updated = await this.prisma.patentino.update({
      where: { id },
      data,
    });
    return Patentino.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.patentino.delete({ where: { id } });
  }
}
