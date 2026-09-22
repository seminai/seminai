import { randomUUID } from 'node:crypto';
import { RuleOnCompany as PrismaRuleOnCompany, Prisma } from '@prisma/client';

interface RuleOnCompanyProps {
  ruleId: string;
  companyId: string;
  isActive: boolean;
  priority: number;
  overrides: Prisma.JsonValue | null;
  notes: string | null;
  assignedById: string;
}

export class RuleOnCompany {
  public readonly id: string;
  public readonly ruleId: string;
  public readonly companyId: string;
  public readonly isActive: boolean;
  public readonly priority: number;
  public readonly overrides: Prisma.JsonValue | null;
  public readonly notes: string | null;
  public readonly assignedAt: Date;
  public readonly assignedById: string;

  constructor(
    id: string,
    ruleId: string,
    companyId: string,
    isActive: boolean,
    priority: number,
    overrides: Prisma.JsonValue | null,
    notes: string | null,
    assignedAt: Date,
    assignedById: string,
  ) {
    this.id = id;
    this.ruleId = ruleId;
    this.companyId = companyId;
    this.isActive = isActive;
    this.priority = priority;
    this.overrides = overrides;
    this.notes = notes;
    this.assignedAt = assignedAt;
    this.assignedById = assignedById;
  }

  static create(props: RuleOnCompanyProps): RuleOnCompany {
    const now = new Date();
    return new RuleOnCompany(
      randomUUID(),
      props.ruleId,
      props.companyId,
      props.isActive,
      props.priority,
      props.overrides,
      props.notes,
      now,
      props.assignedById,
    );
  }

  static fromPrisma(prismaRuleOnCompany: PrismaRuleOnCompany): RuleOnCompany {
    return new RuleOnCompany(
      prismaRuleOnCompany.id,
      prismaRuleOnCompany.ruleId,
      prismaRuleOnCompany.companyId,
      prismaRuleOnCompany.isActive,
      prismaRuleOnCompany.priority,
      prismaRuleOnCompany.overrides,
      prismaRuleOnCompany.notes,
      prismaRuleOnCompany.assignedAt,
      prismaRuleOnCompany.assignedById,
    );
  }
}
