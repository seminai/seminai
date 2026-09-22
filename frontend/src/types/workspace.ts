export type WorkspaceKind = 'AGRICULTURAL' | 'MANUFACTURING';

export const WORKSPACE_KIND_LABELS: Record<WorkspaceKind, string> = {
  AGRICULTURAL: 'Agricola',
  MANUFACTURING: 'Manifatturiera',
};

export interface Workspace {
  readonly id: string;
  readonly name: string;
  readonly logoUrl: string | null;
}

export type WorkspacePlan = 'FREE' | 'PROFESSIONAL' | 'ENTERPRISE';

export const WORKSPACE_MODULES = ['DCA', 'LABELS'] as const;
export type WorkspaceModule = (typeof WORKSPACE_MODULES)[number];

export function isWorkspaceModule(value: unknown): value is WorkspaceModule {
  return typeof value === 'string' && (WORKSPACE_MODULES as readonly string[]).includes(value);
}

export function parseWorkspaceKind(value: unknown): WorkspaceKind {
  return value === 'MANUFACTURING' ? 'MANUFACTURING' : 'AGRICULTURAL';
}

/**
 * Single source of truth for the manufacturing UI gate. A `null` kind (default
 * workspace) is treated as agricultural, so agronomic surfaces stay visible.
 */
export function isManufacturingWorkspace(kind?: WorkspaceKind | null): boolean {
  return kind === 'MANUFACTURING';
}

export interface PlanInfo {
  readonly key: WorkspacePlan;
  readonly label: string;
  readonly maxMembers: number;
  readonly maxRules: number;
  readonly features: readonly string[];
}

export const PLAN_DEFINITIONS: readonly PlanInfo[] = [
  {
    key: 'FREE',
    label: 'Free',
    maxMembers: 5,
    maxRules: 50,
    features: ['5 membri', '50 regole', 'Supporto community'],
  },
  {
    key: 'PROFESSIONAL',
    label: 'Professional',
    maxMembers: 25,
    maxRules: 100,
    features: ['25 membri', '100 regole', 'Supporto prioritario', 'Funzionalità avanzate'],
  },
  {
    key: 'ENTERPRISE',
    label: 'Enterprise',
    maxMembers: 100,
    maxRules: 500,
    features: ['100 membri', '500 regole', 'Supporto dedicato', 'CSS personalizzato', 'Funzionalità complete'],
  },
] as const;

export function getPlanLabel(plan: WorkspacePlan | string | null): string {
  return PLAN_DEFINITIONS.find((p) => p.key === plan)?.label ?? 'Free';
}

export interface WorkspaceDetail {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly description: string | null;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly primaryColor: string | null;
  readonly secondaryColor: string | null;
  readonly accentColor: string | null;
  readonly kind: WorkspaceKind | null;
  readonly plan: WorkspacePlan | null;
  readonly enabledModules: readonly WorkspaceModule[];
}

export interface UpdateWorkspacePayload {
  readonly name?: string;
  readonly slug?: string;
  readonly description?: string;
  readonly logoUrl?: string;
  readonly iconUrl?: string;
  readonly primaryColor?: string;
  readonly secondaryColor?: string;
  readonly accentColor?: string;
}

export type RuleCategory = 'DISCIPLINARE' | 'STANDARD' | 'BEST_PRACTICE' | 'METHODOLOGY' | 'CUSTOM';
export type RuleStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED' | 'DEPRECATED';

export interface Rule {
  readonly id: string;
  readonly name: string;
  readonly slug: string | null;
  readonly description: string | null;
  readonly category: RuleCategory;
  readonly status: RuleStatus;
  readonly region: string | null;
  readonly isPublic: boolean;
  readonly isTemplate: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly pdfFileUrl?: string | null;
  readonly pdfFileName?: string | null;
  readonly isVectorized?: boolean;
  readonly vectorizedAt?: string | null;
  readonly vectorizationError?: string | null;
}

export interface ExpiryNotification {
  readonly id: string;
  readonly fileId: string;
  readonly titolo: string;
  readonly azienda: string;
  readonly scadenza: string;
  readonly severity: 'critical' | 'warning' | 'info';
  readonly message: string;
}
