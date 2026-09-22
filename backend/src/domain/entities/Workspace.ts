import { randomUUID } from 'node:crypto';
import {
  Workspace as PrismaWorkspace,
  WorkspaceKind,
  WorkspaceModule,
  WorkspacePlan,
} from '@prisma/client';

interface WorkspaceProps {
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  iconUrl: string | null;
  primaryColor: string | null;
  secondaryColor: string | null;
  accentColor: string | null;
  customCss: string | null;
  kind: WorkspaceKind;
  plan: WorkspacePlan;
  isActive: boolean;
  maxMembers: number;
  maxRules: number;
  enabledModules?: WorkspaceModule[];
}

export class Workspace {
  public readonly id: string;
  public readonly name: string;
  public readonly slug: string;
  public readonly description: string | null;
  public readonly logoUrl: string | null;
  public readonly iconUrl: string | null;
  public readonly primaryColor: string | null;
  public readonly secondaryColor: string | null;
  public readonly accentColor: string | null;
  public readonly customCss: string | null;
  public readonly kind: WorkspaceKind;
  public readonly plan: WorkspacePlan;
  public readonly isActive: boolean;
  public readonly maxMembers: number;
  public readonly maxRules: number;
  public readonly enabledModules: WorkspaceModule[];
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  constructor(
    id: string,
    name: string,
    slug: string,
    description: string | null,
    logoUrl: string | null,
    iconUrl: string | null,
    primaryColor: string | null,
    secondaryColor: string | null,
    accentColor: string | null,
    customCss: string | null,
    kind: WorkspaceKind,
    plan: WorkspacePlan,
    isActive: boolean,
    maxMembers: number,
    maxRules: number,
    createdAt: Date,
    updatedAt: Date,
    // Trailing optional with a domain default so existing positional callers stay valid.
    enabledModules: WorkspaceModule[] = [WorkspaceModule.DCA],
  ) {
    this.id = id;
    this.name = name;
    this.slug = slug;
    this.description = description;
    this.logoUrl = logoUrl;
    this.iconUrl = iconUrl;
    this.primaryColor = primaryColor;
    this.secondaryColor = secondaryColor;
    this.accentColor = accentColor;
    this.customCss = customCss;
    this.kind = kind;
    this.plan = plan;
    this.isActive = isActive;
    this.maxMembers = maxMembers;
    this.maxRules = maxRules;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
    this.enabledModules = enabledModules;
  }

  static create(props: WorkspaceProps): Workspace {
    const now = new Date();
    return new Workspace(
      randomUUID(),
      props.name,
      props.slug,
      props.description,
      props.logoUrl,
      props.iconUrl,
      props.primaryColor ?? '#2563eb',
      props.secondaryColor ?? '#1e40af',
      props.accentColor ?? '#3b82f6',
      props.customCss,
      props.kind,
      props.plan,
      props.isActive,
      props.maxMembers,
      props.maxRules,
      now,
      now,
      props.enabledModules ?? [WorkspaceModule.DCA],
    );
  }

  static fromPrisma(prismaWorkspace: PrismaWorkspace): Workspace {
    return new Workspace(
      prismaWorkspace.id,
      prismaWorkspace.name,
      prismaWorkspace.slug,
      prismaWorkspace.description,
      prismaWorkspace.logoUrl,
      prismaWorkspace.iconUrl,
      prismaWorkspace.primaryColor,
      prismaWorkspace.secondaryColor,
      prismaWorkspace.accentColor,
      prismaWorkspace.customCss,
      prismaWorkspace.kind,
      prismaWorkspace.plan,
      prismaWorkspace.isActive,
      prismaWorkspace.maxMembers,
      prismaWorkspace.maxRules,
      prismaWorkspace.createdAt,
      prismaWorkspace.updatedAt,
      prismaWorkspace.enabledModules,
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
   * Check if workspace can add more members based on plan limits
   */
  canAddMember(currentMemberCount: number): boolean {
    return currentMemberCount < this.maxMembers;
  }

  /**
   * Check if workspace can add more rules based on plan limits
   */
  canAddRule(currentRuleCount: number): boolean {
    return currentRuleCount < this.maxRules;
  }

  /**
   * Check if workspace has enterprise features
   */
  hasEnterpriseFeatures(): boolean {
    return this.plan === 'ENTERPRISE';
  }

  /**
   * Check if workspace has professional or higher features
   */
  hasProfessionalFeatures(): boolean {
    return this.plan === 'PROFESSIONAL' || this.plan === 'ENTERPRISE';
  }

  isAgricultural(): boolean {
    return this.kind === WorkspaceKind.AGRICULTURAL;
  }

  isManufacturing(): boolean {
    return this.kind === WorkspaceKind.MANUFACTURING;
  }
}
