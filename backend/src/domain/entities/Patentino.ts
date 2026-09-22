import { randomUUID } from 'node:crypto';
import { Patentino as PrismaPatentino } from '@prisma/client';

export class Patentino {
  constructor(
    public readonly id: string,
    public readonly type: string,
    public readonly code: string,
    public readonly expiresAt: Date,
    public readonly releaseAt: Date,
    public readonly isActive: boolean,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly userId: string,
  ) {}

  static create(props: Omit<PrismaPatentino, 'id' | 'createdAt' | 'updatedAt'>): Patentino {
    return new Patentino(
      randomUUID(),
      props.type,
      props.code,
      props.expiresAt,
      props.releaseAt,
      props.isActive,
      new Date(),
      new Date(),
      props.userId,
    );
  }

  static fromPrisma(prismaPatentino: PrismaPatentino): Patentino {
    return new Patentino(
      prismaPatentino.id,
      prismaPatentino.type,
      prismaPatentino.code,
      prismaPatentino.expiresAt,
      prismaPatentino.releaseAt,
      prismaPatentino.isActive,
      prismaPatentino.createdAt,
      prismaPatentino.updatedAt,
      prismaPatentino.userId,
    );
  }

  isExpired(referenceDate: Date = new Date()): boolean {
    return this.expiresAt.getTime() < referenceDate.getTime();
  }

  isValidCode(): boolean {
    const trimmed = this.code?.trim() ?? '';
    return trimmed.length > 0;
  }
}
