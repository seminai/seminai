import { PrismaClient } from '@prisma/client';
import { Warehouse } from '../../domain/entities/Warehouse';
import { IWarehouseRepository } from '../../domain/repositories/IWarehouseRepository';

export class PrismaWarehouseRepository implements IWarehouseRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(warehouse: Warehouse): Promise<Warehouse> {
    const created = await this.prisma.warehouse.create({
      data: {
        id: warehouse.id,
        companyId: warehouse.companyId,
        name: warehouse.name,
        nation: warehouse.nation,
        region: warehouse.region,
        city: warehouse.city,
        address: warehouse.address,
        cap: warehouse.cap,
        sezione: warehouse.sezione,
        foglio: warehouse.foglio,
        particella: warehouse.particella,
        subalterno: warehouse.subalterno,
        createdAt: warehouse.createdAt,
        updatedAt: warehouse.updatedAt,
      },
    });
    return Warehouse.fromPrisma(created);
  }

  async findById(id: string): Promise<Warehouse | null> {
    const found = await this.prisma.warehouse.findUnique({ where: { id } });
    if (!found) return null;
    return Warehouse.fromPrisma(found);
  }

  async findManyByCompanyId(companyId: string): Promise<Warehouse[]> {
    const list = await this.prisma.warehouse.findMany({ where: { companyId } });
    return list.map(Warehouse.fromPrisma);
  }

  async update(id: string, data: Partial<Warehouse>): Promise<Warehouse> {
    const updated = await this.prisma.warehouse.update({
      where: { id },
      data,
    });
    return Warehouse.fromPrisma(updated);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.warehouse.delete({ where: { id } });
  }
}
