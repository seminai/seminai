import { randomUUID } from 'node:crypto';
import { Rule as PrismaRule, RuleCategory, RuleStatus, Prisma } from '@prisma/client';

interface RuleProps {
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  category: RuleCategory;
  status: RuleStatus;
  content: Prisma.JsonValue;
  sourceUrl: string | null;
  sourceDocument: string | null;
  region: string | null;
  validFrom: Date | null;
  validUntil: Date | null;
  version: string | null;
  isPublic: boolean;
  isTemplate: boolean;
  createdById: string;
  pdfFileUrl?: string | null;
  pdfFileName?: string | null;
  pdfFileHash?: string | null;
}

export class Rule {
  public readonly id: string;
  public readonly workspaceId: string;
  public readonly name: string;
  public readonly slug: string;
  public readonly description: string | null;
  public readonly category: RuleCategory;
  public readonly status: RuleStatus;
  public readonly content: Prisma.JsonValue;
  public readonly sourceUrl: string | null;
  public readonly sourceDocument: string | null;
  public readonly region: string | null;
  public readonly validFrom: Date | null;
  public readonly validUntil: Date | null;
  public readonly version: string | null;
  public readonly isPublic: boolean;
  public readonly isTemplate: boolean;
  public readonly createdById: string;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly pdfFileUrl: string | null;
  public readonly pdfFileName: string | null;
  public readonly pdfFileHash: string | null;
  public readonly qdrantCollection: string | null;
  public readonly isVectorized: boolean;
  public readonly vectorizedAt: Date | null;
  public readonly vectorizationError: string | null;

  constructor(
    id: string,
    workspaceId: string,
    name: string,
    slug: string,
    description: string | null,
    category: RuleCategory,
    status: RuleStatus,
    content: Prisma.JsonValue,
    sourceUrl: string | null,
    sourceDocument: string | null,
    region: string | null,
    validFrom: Date | null,
    validUntil: Date | null,
    version: string | null,
    isPublic: boolean,
    isTemplate: boolean,
    createdById: string,
    createdAt: Date,
    updatedAt: Date,
    pdfFileUrl: string | null = null,
    pdfFileName: string | null = null,
    pdfFileHash: string | null = null,
    qdrantCollection: string | null = null,
    isVectorized: boolean = false,
    vectorizedAt: Date | null = null,
    vectorizationError: string | null = null,
  ) {
    this.id = id;
    this.workspaceId = workspaceId;
    this.name = name;
    this.slug = slug;
    this.description = description;
    this.category = category;
    this.status = status;
    this.content = content;
    this.sourceUrl = sourceUrl;
    this.sourceDocument = sourceDocument;
    this.region = region;
    this.validFrom = validFrom;
    this.validUntil = validUntil;
    this.version = version;
    this.isPublic = isPublic;
    this.isTemplate = isTemplate;
    this.createdById = createdById;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.pdfFileUrl = pdfFileUrl;
    this.pdfFileName = pdfFileName;
    this.pdfFileHash = pdfFileHash;
    this.qdrantCollection = qdrantCollection;
    this.isVectorized = isVectorized;
    this.vectorizedAt = vectorizedAt;
    this.vectorizationError = vectorizationError;
  }

  static create(props: RuleProps): Rule {
    const now = new Date();
    return new Rule(
      randomUUID(),
      props.workspaceId,
      props.name,
      props.slug,
      props.description,
      props.category,
      props.status,
      props.content,
      props.sourceUrl,
      props.sourceDocument,
      props.region,
      props.validFrom,
      props.validUntil,
      props.version ?? '1.0',
      props.isPublic,
      props.isTemplate,
      props.createdById,
      now,
      now,
      props.pdfFileUrl ?? null,
      props.pdfFileName ?? null,
      props.pdfFileHash ?? null,
      null,
      false,
      null,
      null,
    );
  }

  static fromPrisma(prismaRule: PrismaRule): Rule {
    return new Rule(
      prismaRule.id,
      prismaRule.workspaceId,
      prismaRule.name,
      prismaRule.slug,
      prismaRule.description,
      prismaRule.category,
      prismaRule.status,
      prismaRule.content,
      prismaRule.sourceUrl,
      prismaRule.sourceDocument,
      prismaRule.region,
      prismaRule.validFrom,
      prismaRule.validUntil,
      prismaRule.version,
      prismaRule.isPublic,
      prismaRule.isTemplate,
      prismaRule.createdById,
      prismaRule.createdAt,
      prismaRule.updatedAt,
      prismaRule.pdfFileUrl,
      prismaRule.pdfFileName,
      prismaRule.pdfFileHash,
      prismaRule.qdrantCollection,
      prismaRule.isVectorized,
      prismaRule.vectorizedAt,
      prismaRule.vectorizationError,
    );
  }

  /**
   * Generates a URL-friendly slug from a name
   */
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

  /**
   * Check if rule is active
   */
  isActive(): boolean {
    return this.status === 'ACTIVE';
  }

  /**
   * Check if rule is currently valid based on dates
   */
  isCurrentlyValid(): boolean {
    const now = new Date();
    if (this.validFrom && now < this.validFrom) {
      return false;
    }
    if (this.validUntil && now > this.validUntil) {
      return false;
    }
    return true;
  }

  /**
   * Check if rule is a disciplinare
   */
  isDisciplinare(): boolean {
    return this.category === 'DISCIPLINARE';
  }

  /**
   * Check if rule is a standard
   */
  isStandard(): boolean {
    return this.category === 'STANDARD';
  }

  /**
   * Check if rule has a vectorized PDF available for RAG queries
   */
  hasVectorizedPdf(): boolean {
    return this.isVectorized && this.pdfFileUrl !== null;
  }
}
