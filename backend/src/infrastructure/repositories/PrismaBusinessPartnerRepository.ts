import { PartnerType, Prisma, PrismaClient } from '@prisma/client';
import { BusinessPartner } from '../../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../../domain/repositories/IBusinessPartnerRepository';
import { PartnerDuplicateQuery } from '../../domain/dtos/business-partner.dto';

export class PrismaBusinessPartnerRepository implements IBusinessPartnerRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(partner: BusinessPartner): Promise<BusinessPartner> {
    const created = await this.prisma.businessPartner.create({
      data: {
        id: partner.id,
        companyId: partner.companyId,
        type: partner.type,
        name: partner.name,
        vatNumber: partner.vatNumber,
        fiscalCode: partner.fiscalCode,
        sdiCode: partner.sdiCode,
        pec: partner.pec,
        email: partner.email,
        phone: partner.phone,
        referent: partner.referent,
        nation: partner.nation,
        city: partner.city,
        address: partner.address,
        cap: partner.cap,
        deliveryAddress: partner.deliveryAddress,
        deliveryCity: partner.deliveryCity,
        deliveryCap: partner.deliveryCap,
        deliveryNation: partner.deliveryNation,
        deliveryNotesText: partner.deliveryNotesText,
        deliveryHours: partner.deliveryHours,
        isActive: partner.isActive,
        createdAt: partner.createdAt,
        updatedAt: partner.updatedAt,
      },
    });
    return BusinessPartner.fromPrisma(created);
  }

  async update(id: string, data: Partial<BusinessPartner>): Promise<BusinessPartner> {
    const immutableKeys = new Set(['id', 'companyId', 'createdAt', 'updatedAt']);
    const updateData: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      if (!immutableKeys.has(key) && value !== undefined) {
        updateData[key] = value;
      }
    }
    const updated = await this.prisma.businessPartner.update({
      where: { id },
      data: updateData as Prisma.BusinessPartnerUpdateInput,
    });
    return BusinessPartner.fromPrisma(updated);
  }

  async findById(id: string): Promise<BusinessPartner | null> {
    const found = await this.prisma.businessPartner.findUnique({ where: { id } });
    return found ? BusinessPartner.fromPrisma(found) : null;
  }

  async findManyByCompany(
    companyId: string,
    options?: { type?: PartnerType },
  ): Promise<BusinessPartner[]> {
    const rows = await this.prisma.businessPartner.findMany({
      where: { companyId, ...(options?.type ? { type: options.type } : {}) },
      orderBy: { name: 'asc' },
    });
    return rows.map(BusinessPartner.fromPrisma);
  }

  async findDuplicate(query: PartnerDuplicateQuery): Promise<BusinessPartner | null> {
    const or: Prisma.BusinessPartnerWhereInput[] = [];
    if (query.vatNumber) or.push({ vatNumber: query.vatNumber });
    if (query.email) or.push({ email: { equals: query.email, mode: 'insensitive' } });
    if (query.name) or.push({ name: { equals: query.name, mode: 'insensitive' } });
    if (or.length === 0) return null;
    const found = await this.prisma.businessPartner.findFirst({
      where: { companyId: query.companyId, type: query.type, OR: or },
    });
    return found ? BusinessPartner.fromPrisma(found) : null;
  }

  async search(params: {
    companyId: string;
    type?: PartnerType;
    query: string;
  }): Promise<BusinessPartner[]> {
    const rows = await this.prisma.businessPartner.findMany({
      where: {
        companyId: params.companyId,
        ...(params.type ? { type: params.type } : {}),
        OR: [
          { name: { contains: params.query, mode: 'insensitive' } },
          { vatNumber: { contains: params.query } },
          { email: { contains: params.query, mode: 'insensitive' } },
        ],
      },
      orderBy: { name: 'asc' },
      take: 25,
    });
    return rows.map(BusinessPartner.fromPrisma);
  }

  async findDueForFollowUp(before: Date): Promise<BusinessPartner[]> {
    const rows = await this.prisma.businessPartner.findMany({
      where: {
        followUpEnabled: true,
        isActive: true,
        type: PartnerType.CUSTOMER,
        email: { not: null },
        OR: [{ followUpLastSentAt: null }, { followUpLastSentAt: { lt: before } }],
      },
      orderBy: { followUpLastSentAt: 'asc' },
    });
    return rows.map(BusinessPartner.fromPrisma);
  }
}
