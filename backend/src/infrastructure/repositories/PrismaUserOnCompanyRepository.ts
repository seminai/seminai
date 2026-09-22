import { PrismaClient } from '@prisma/client';
import { UserOnCompany } from '../../domain/entities/UserOnCompany';
import { IUserOnCompanyRepository } from '../../domain/repositories/IUserOnCompanyRepository';
import {
  UserOnCompanyWithDetailsDTO,
  CompanyWithDetailsDTO,
} from '../../domain/dtos/user-on-company.dto';

export class PrismaUserOnCompanyRepository implements IUserOnCompanyRepository {
  constructor(private prisma: PrismaClient) {}

  async create(userOnCompany: UserOnCompany): Promise<UserOnCompany> {
    const createdUserOnCompany = await this.prisma.userOnCompany.create({
      data: {
        id: userOnCompany.id,
        companyId: userOnCompany.companyId,
        userId: userOnCompany.userId,
        type: userOnCompany.type,
        role: userOnCompany.role,
      },
    });
    return UserOnCompany.fromPrisma(createdUserOnCompany);
  }

  async findById(id: string): Promise<UserOnCompany | null> {
    const userOnCompany = await this.prisma.userOnCompany.findUnique({
      where: { id },
    });
    if (!userOnCompany) return null;
    return UserOnCompany.fromPrisma(userOnCompany);
  }

  async findByCompanyId(companyId: string): Promise<UserOnCompany[]> {
    const userOnCompanies = await this.prisma.userOnCompany.findMany({
      where: { companyId },
    });
    return userOnCompanies.map(UserOnCompany.fromPrisma);
  }

  async findByCompanyIdWithDetails(companyId: string): Promise<UserOnCompanyWithDetailsDTO[]> {
    const userOnCompanies = await this.prisma.userOnCompany.findMany({
      where: { companyId },
      include: {
        user: true,
        company: true,
      },
    });
    return userOnCompanies.map((uoc) => ({
      id: uoc.id,
      companyId: uoc.companyId,
      userId: uoc.userId,
      type: uoc.type,
      role: uoc.role,
      user: {
        id: uoc.user.id,
        name: uoc.user.name,
        email: uoc.user.email,
        surname: uoc.user.surname,
        phoneNumber: uoc.user.phoneNumber,
        profilePictureUrl: uoc.user.profilePictureUrl,
        lastAccessAt: uoc.user.lastAccessAt,
        invitationPending: uoc.user.lastAccessAt === null && uoc.user.googleId === null,
      },
      company: {
        id: uoc.company.id,
        name: uoc.company.name,
        email: uoc.company.email,
        vatNumber: uoc.company.vatNumber,
        fiscalCode: uoc.company.fiscalCode,
      },
    }));
  }

  async findByUserId(userId: string): Promise<UserOnCompany[]> {
    const userOnCompanies = await this.prisma.userOnCompany.findMany({
      where: { userId },
    });
    return userOnCompanies.map(UserOnCompany.fromPrisma);
  }

  async findByUserIdWithDetails(userId: string): Promise<CompanyWithDetailsDTO[]> {
    const userOnCompanies = await this.prisma.userOnCompany.findMany({
      where: { userId },
      include: {
        company: true,
      },
    });
    return userOnCompanies.map((uoc) => ({
      id: uoc.id,
      companyId: uoc.companyId,
      userId: uoc.userId,
      type: uoc.type,
      role: uoc.role,
      company: {
        id: uoc.company.id,
        name: uoc.company.name,
        email: uoc.company.email,
        vatNumber: uoc.company.vatNumber,
        fiscalCode: uoc.company.fiscalCode,
        city: uoc.company.city,
        address: uoc.company.address,
        phoneNumber: uoc.company.phoneNumber,
        website: uoc.company.website,
        logoUrl: uoc.company.logoUrl,
      },
    }));
  }

  async findByCompanyAndUser(companyId: string, userId: string): Promise<UserOnCompany | null> {
    const userOnCompany = await this.prisma.userOnCompany.findFirst({
      where: {
        companyId,
        userId,
      },
    });
    if (!userOnCompany) return null;
    return UserOnCompany.fromPrisma(userOnCompany);
  }

  async update(id: string, userOnCompanyData: Partial<UserOnCompany>): Promise<UserOnCompany> {
    const updatedUserOnCompany = await this.prisma.userOnCompany.update({
      where: { id },
      data: userOnCompanyData,
    });
    return UserOnCompany.fromPrisma(updatedUserOnCompany);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.userOnCompany.delete({
      where: { id },
    });
  }

  async deleteByCompanyAndUser(companyId: string, userId: string): Promise<void> {
    await this.prisma.userOnCompany.deleteMany({
      where: {
        companyId,
        userId,
      },
    });
  }
}
