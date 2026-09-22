import { randomUUID } from 'node:crypto';
import { User as PrismaUser, UserRole } from '@prisma/client';

export class User {
  constructor(
    public readonly id: string,
    public readonly email: string,
    public readonly password: string | null,
    public readonly name: string,
    public readonly surname: string | null,
    public readonly fiscalCode: string | null,
    public readonly companyName: string | null,
    public readonly vatNumber: string | null,
    public readonly phoneNumber: string | null,
    public readonly address: string | null,
    public readonly profilePictureUrl: string | null,
    public readonly role: UserRole,
    public readonly credits: number,
    public readonly emailVerified: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly googleId: string | null = null,
    public readonly lastAccessAt: Date | null = null,
    public readonly isBlocked: boolean = false,
    public readonly blockedAt: Date | null = null,
    public readonly blockedReason: string | null = null,
    public readonly isDeactivated: boolean = false,
    public readonly deactivatedAt: Date | null = null,
    public readonly deactivatedReason: string | null = null,
  ) {}

  static create(
    props: Omit<
      PrismaUser,
      | 'id'
      | 'createdAt'
      | 'updatedAt'
      | 'emailVerified'
      | 'googleId'
      | 'password'
      | 'lastAccessAt'
      | 'isBlocked'
      | 'blockedAt'
      | 'blockedReason'
      | 'isDeactivated'
      | 'deactivatedAt'
      | 'deactivatedReason'
    > & { googleId?: string | null; password?: string | null },
  ): User {
    return new User(
      randomUUID(),
      props.email,
      props.password ?? null,
      props.name,
      props.surname,
      props.fiscalCode,
      props.companyName,
      props.vatNumber,
      props.phoneNumber,
      props.address,
      props.profilePictureUrl ?? null,
      props.role,
      props.credits,
      false,
      new Date(),
      new Date(),
      props.googleId ?? null,
      null,
      false,
      null,
      null,
      false,
      null,
      null,
    );
  }

  static fromPrisma(prismaUser: PrismaUser): User {
    return new User(
      prismaUser.id,
      prismaUser.email,
      prismaUser.password,
      prismaUser.name,
      prismaUser.surname,
      prismaUser.fiscalCode,
      prismaUser.companyName,
      prismaUser.vatNumber,
      prismaUser.phoneNumber,
      prismaUser.address,
      prismaUser.profilePictureUrl,
      prismaUser.role,
      prismaUser.credits,
      prismaUser.emailVerified,
      prismaUser.createdAt,
      prismaUser.updatedAt,
      prismaUser.googleId ?? null,
      prismaUser.lastAccessAt,
      prismaUser.isBlocked,
      prismaUser.blockedAt,
      prismaUser.blockedReason,
      prismaUser.isDeactivated,
      prismaUser.deactivatedAt,
      prismaUser.deactivatedReason,
    );
  }
}
