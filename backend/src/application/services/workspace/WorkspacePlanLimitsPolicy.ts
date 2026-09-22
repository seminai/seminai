import { WorkspacePlan } from '@prisma/client';

export interface WorkspacePlanLimits {
  maxMembers: number;
  maxRules: number;
}

const PLAN_LIMITS: Record<WorkspacePlan, WorkspacePlanLimits> = {
  FREE: { maxMembers: 5, maxRules: 50 },
  PROFESSIONAL: { maxMembers: 25, maxRules: 100 },
  ENTERPRISE: { maxMembers: 100, maxRules: 500 },
} as const;

const PLAN_PRIORITY: Record<WorkspacePlan, number> = {
  FREE: 0,
  PROFESSIONAL: 1,
  ENTERPRISE: 2,
} as const;

export class WorkspacePlanLimitsPolicy {
  static getLimits(plan: WorkspacePlan): WorkspacePlanLimits {
    return PLAN_LIMITS[plan];
  }

  static hasEnterpriseFeatures(plan: WorkspacePlan): boolean {
    return plan === 'ENTERPRISE';
  }

  static isDowngrade(previousPlan: WorkspacePlan, nextPlan: WorkspacePlan): boolean {
    return PLAN_PRIORITY[nextPlan] < PLAN_PRIORITY[previousPlan];
  }
}
