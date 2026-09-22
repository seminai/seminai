import { PrismaClient } from '@prisma/client';
import { Company } from '../../domain/entities/Company';
import { ICompanyRepository } from '../../domain/repositories/ICompanyRepository';
import { deleteCompanyWithAllData } from './prisma-company-full-deletion';

export class PrismaCompanyRepository implements ICompanyRepository {
  constructor(private prisma: PrismaClient) {}

  async create(company: Company): Promise<Company> {
    const createdCompany = await this.prisma.company.create({
      data: {
        id: company.id,
        name: company.name,
        vatNumber: company.vatNumber,
        cuaa: company.cuaa ?? undefined,
        ownerId: company.ownerId ?? undefined,
        fiscalCode: company.fiscalCode,
        nation: company.nation,
        city: company.city,
        address: company.address,
        cap: company.cap,
        email: company.email,
        phoneNumber: company.phoneNumber,
        website: company.website,
        logoUrl: company.logoUrl,
        kind: company.kind,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    });
    return Company.fromPrisma(createdCompany);
  }

  async createMany(companies: Company[]): Promise<void> {
    if (!Array.isArray(companies) || companies.length === 0) return;
    await this.prisma.company.createMany({
      data: companies.map((c) => ({
        id: c.id,
        name: c.name,
        vatNumber: c.vatNumber,
        cuaa: c.cuaa ?? undefined,
        ownerId: c.ownerId ?? undefined,
        fiscalCode: c.fiscalCode,
        nation: c.nation,
        city: c.city,
        address: c.address,
        cap: c.cap,
        email: c.email,
        phoneNumber: c.phoneNumber,
        website: c.website,
        logoUrl: c.logoUrl,
        kind: c.kind,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })),
      skipDuplicates: true,
    });
  }

  async findById(id: string): Promise<Company | null> {
    const company = await this.prisma.company.findUnique({
      where: { id },
    });
    if (!company) return null;
    return Company.fromPrisma(company);
  }

  async findManyByUserId(userId: string): Promise<Company[]> {
    const links = await this.prisma.userOnCompany.findMany({
      where: { userId },
      select: { companyId: true },
    });
    const companyIds = links.map((l) => l.companyId);
    if (companyIds.length === 0) return [];
    const companies = await this.prisma.company.findMany({ where: { id: { in: companyIds } } });
    return companies.map(Company.fromPrisma);
  }

  async findByVatNumber(vatNumber: string): Promise<Company | null> {
    const company = await this.prisma.company.findFirst({
      where: { vatNumber },
    });
    if (!company) return null;
    return Company.fromPrisma(company);
  }

  async findByFiscalCode(fiscalCode: string): Promise<Company | null> {
    const company = await this.prisma.company.findFirst({
      where: { fiscalCode },
    });
    if (!company) return null;
    return Company.fromPrisma(company);
  }

  async update(id: string, companyData: Partial<Company>): Promise<Company> {
    const updatedCompany = await this.prisma.company.update({
      where: { id },
      data: companyData,
    });
    return Company.fromPrisma(updatedCompany);
  }

  async getCourierEmail(companyId: string): Promise<string | null> {
    const row = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { courierEmail: true },
    });
    return row?.courierEmail ?? null;
  }

  async setCourierEmail(companyId: string, courierEmail: string | null): Promise<void> {
    await this.prisma.company.update({ where: { id: companyId }, data: { courierEmail } });
  }

  async updateMany(updates: Array<{ id: string; data: Partial<Company> }>): Promise<number> {
    let count = 0;
    for (const { id, data } of updates) {
      await this.prisma.company.update({
        where: { id },
        data,
      });
      count++;
    }
    return count;
  }

  async delete(id: string): Promise<void> {
    await this.prisma.company.delete({
      where: { id },
    });
  }

  async deleteWithAllData(id: string): Promise<void> {
    await deleteCompanyWithAllData(this.prisma, id);
  }
}
