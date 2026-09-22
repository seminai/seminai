import { randomUUID } from 'node:crypto';
import { Skill as PrismaSkill, SkillStatus } from '@prisma/client';

interface SkillProps {
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  instructions: string;
  sourceRuleId: string | null;
  isPublic: boolean;
  createdById: string;
}

export class Skill {
  public readonly id: string;
  public readonly workspaceId: string;
  public readonly name: string;
  public readonly slug: string;
  public readonly description: string | null;
  public readonly status: SkillStatus;
  public readonly instructions: string;
  public readonly sourceRuleId: string | null;
  public readonly isPublic: boolean;
  public readonly isFeatured: boolean;
  public readonly viewCount: number;
  public readonly createdById: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(
    id: string,
    workspaceId: string,
    name: string,
    slug: string,
    description: string | null,
    status: SkillStatus,
    instructions: string,
    sourceRuleId: string | null,
    isPublic: boolean,
    isFeatured: boolean,
    viewCount: number,
    createdById: string,
    createdAt: Date,
    updatedAt: Date,
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.name = name;
    this.slug = slug;
    this.description = description;
    this.status = status;
    this.instructions = instructions;
    this.sourceRuleId = sourceRuleId;
    this.isPublic = isPublic;
    this.isFeatured = isFeatured;
    this.viewCount = viewCount;
    this.createdById = createdById;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }

  static create(props: SkillProps): Skill {
    const now = new Date();
    return new Skill(
      randomUUID(),
      props.workspaceId,
      props.name,
      props.slug,
      props.description,
      'DRAFT',
      props.instructions,
      props.sourceRuleId,
      props.isPublic,
      false,
      0,
      props.createdById,
      now,
      now,
    );
  }

  static fromPrisma(prismaSkill: PrismaSkill): Skill {
    return new Skill(
      prismaSkill.id,
      prismaSkill.workspaceId,
      prismaSkill.name,
      prismaSkill.slug,
      prismaSkill.description,
      prismaSkill.status,
      prismaSkill.instructions,
      prismaSkill.sourceRuleId,
      prismaSkill.isPublic,
      prismaSkill.isFeatured,
      prismaSkill.viewCount,
      prismaSkill.createdById,
      prismaSkill.createdAt,
      prismaSkill.updatedAt,
    );
  }

  /** Generates a URL-friendly slug from a name (mirrors `Rule.generateSlug`). */
  static generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[àáâãäå]/g, 'a')
      .replace(/[èéêë]/g, 'e')
      .replace(/[ìíîï]/g, 'i')
      .replace(/[òóôõö]/g, 'o')
      .replace(/[ùúûü]/g, 'u')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .trim();
  }

  isActive(): boolean {
    return this.status === 'ACTIVE';
  }
}
