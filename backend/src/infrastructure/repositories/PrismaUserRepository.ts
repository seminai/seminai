import { PrismaClient } from '@prisma/client';
import { User } from '../../domain/entities/User';
import { IUserRepository } from '../../domain/repositories/IUserRepository';

export class PrismaUserRepository implements IUserRepository {
  constructor(private prisma: PrismaClient) {}

  async create(user: User): Promise<User> {
    const createdUser = await this.prisma.user.create({
      data: {
        id: user.id,
        email: user.email,
        password: user.password,
        name: user.name,
        surname: user.surname,
        fiscalCode: user.fiscalCode,
        companyName: user.companyName,
        vatNumber: user.vatNumber,
        phoneNumber: user.phoneNumber,
        address: user.address,
        profilePictureUrl: user.profilePictureUrl,
        role: user.role,
        credits: user.credits,
        emailVerified: user.emailVerified,
        lastAccessAt: user.lastAccessAt ?? undefined,
        isBlocked: user.isBlocked,
        blockedAt: user.blockedAt ?? undefined,
        blockedReason: user.blockedReason ?? undefined,
        isDeactivated: user.isDeactivated,
        deactivatedAt: user.deactivatedAt ?? undefined,
        deactivatedReason: user.deactivatedReason ?? undefined,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        googleId: user.googleId,
      },
    });
    return User.fromPrisma(createdUser);
  }

  async findByEmail(email: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) return null;
    return User.fromPrisma(user);
  }

  async findById(id: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });
    if (!user) return null;
    return User.fromPrisma(user);
  }

  async findByGoogleId(googleId: string): Promise<User | null> {
    const user = await this.prisma.user.findUnique({
      where: { googleId },
    });
    if (!user) return null;
    return User.fromPrisma(user);
  }

  async findByPhoneNumber(phoneNumber: string): Promise<User | null> {
    // Normalize phone number: remove spaces, dashes, parentheses
    const normalized = phoneNumber.replace(/[\s\-\(\)]/g, '');

    // Search with multiple formats to handle +39 prefix variations
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { phoneNumber: normalized },
          { phoneNumber: phoneNumber },
          { phoneNumber: normalized.replace(/^\+/, '') },
          { phoneNumber: normalized.replace(/^\+39/, '') },
          { phoneNumber: `+39${normalized.replace(/^\+39/, '')}` },
        ],
      },
    });
    if (!user) return null;
    return User.fromPrisma(user);
  }

  async update(id: string, userData: Partial<User>): Promise<User> {
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: userData,
    });
    return User.fromPrisma(updatedUser);
  }

  async delete(id: string): Promise<void> {
    await this.prisma.user.delete({
      where: { id },
    });
  }

  async deductCredits(userId: string, amount: number): Promise<User> {
    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: {
        credits: {
          decrement: amount,
        },
      },
    });
    return User.fromPrisma(updatedUser);
  }
}
