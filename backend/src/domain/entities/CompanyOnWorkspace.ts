import { randomUUID } from 'node:crypto';
import { CompanyOnWorkspace as PrismaCompanyOnWorkspace } from '@prisma/client';

interface CompanyOnWorkspaceProps {
  readonly workspaceId: string;
  readonly companyId: string;
  readonly assignedById?: string | null;
}

export class CompanyOnWorkspace {
  public readonly id: string;
  public readonly workspaceId: string;
  public readonly companyId: string;
  public readonly assignedById: string | null;
  public readonly assignedAt: Date;

  constructor(
    id: string,
    workspaceId: string,
    companyId: string,
    assignedById: string | null,
    assignedAt: Date,
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.companyId = companyId;
    this.assignedById = assignedById;
    this.assignedAt = assignedAt;
  }

  static create(props: CompanyOnWorkspaceProps): CompanyOnWorkspace {
    return new CompanyOnWorkspace(
      randomUUID(),
      props.workspaceId,
      props.companyId,
      props.assignedById ?? null,
      new Date(),
    );
  }

  static fromPrisma(record: PrismaCompanyOnWorkspace): CompanyOnWorkspace {
    return new CompanyOnWorkspace(
      record.id,
      record.workspaceId,
      record.companyId,
      record.assignedById,
      record.assignedAt,
    );
  }
}
