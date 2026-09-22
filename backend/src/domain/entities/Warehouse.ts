import { randomUUID } from 'node:crypto';
import { Warehouse as PrismaWarehouse } from '@prisma/client';

/**
 * Warehouse domain entity representing a company warehouse.
 */
export class Warehouse {
  constructor(
    public readonly id: string,
    public readonly companyId: string,
    public readonly name: string,
    public readonly address: string,
    public readonly nation: string | null,
    public readonly region: string | null,
    public readonly city: string | null,
    public readonly cap: string | null,
    public readonly sezione: string,
    public readonly foglio: string,
    public readonly particella: string,
    public readonly subalterno: string | null,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  static create(props: Omit<PrismaWarehouse, 'id' | 'createdAt' | 'updatedAt'>): Warehouse {
    return new Warehouse(
      randomUUID(),
      props.companyId,
      props.name,
      props.address,
      props.nation ?? null,
      props.region ?? null,
      props.city ?? null,
      props.cap ?? null,
      props.sezione,
      props.foglio,
      props.particella,
      props.subalterno ?? null,
      new Date(),
      new Date(),
    );
  }

  static fromPrisma(prismaWarehouse: PrismaWarehouse): Warehouse {
    return new Warehouse(
      prismaWarehouse.id,
      prismaWarehouse.companyId,
      prismaWarehouse.name,
      prismaWarehouse.address,
      prismaWarehouse.nation,
      prismaWarehouse.region,
      prismaWarehouse.city,
      prismaWarehouse.cap,
      prismaWarehouse.sezione,
      prismaWarehouse.foglio,
      prismaWarehouse.particella,
      prismaWarehouse.subalterno,
      prismaWarehouse.createdAt,
      prismaWarehouse.updatedAt,
    );
  }
}
