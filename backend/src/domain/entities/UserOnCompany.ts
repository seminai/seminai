import { randomUUID } from 'node:crypto';
import { UserOnCompany as PrismaUserOnCompany, CompanyRole } from '@prisma/client';

export class UserOnCompany {
  constructor(
    public readonly id: string,
    public readonly companyId: string,
    public readonly userId: string,
    public readonly type: string | null,
    public readonly role: CompanyRole,
  ) {}

  static create(props: Omit<PrismaUserOnCompany, 'id'>): UserOnCompany {
    return new UserOnCompany(
      randomUUID(),
      props.companyId,
      props.userId,
      props.type ?? null,
      props.role,
    );
  }

  static fromPrisma(prismaUserOnCompany: PrismaUserOnCompany): UserOnCompany {
    return new UserOnCompany(
      prismaUserOnCompany.id,
      prismaUserOnCompany.companyId,
      prismaUserOnCompany.userId,
      prismaUserOnCompany.type ?? null,
      prismaUserOnCompany.role as CompanyRole,
    );
  }

  isAdmin(): boolean {
    return this.role === CompanyRole.ADMIN;
  }

  isEditor(): boolean {
    return this.role === CompanyRole.EDITOR;
  }

  isViewer(): boolean {
    return this.role === CompanyRole.VIEWER;
  }

  canEdit(): boolean {
    return this.isAdmin() || this.isEditor();
  }

  canDelete(): boolean {
    return this.isAdmin();
  }

  canView(): boolean {
    return true;
  }

  canManageUsers(): boolean {
    return this.isAdmin() || this.isEditor();
  }
}
