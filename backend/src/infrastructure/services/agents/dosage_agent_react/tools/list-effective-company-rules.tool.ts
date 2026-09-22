import { DynamicStructuredTool } from '@langchain/core/tools';
import { Prisma, RuleStatus } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { assertCompanyAccess, assertWorkspaceAccess } from '../../shared/authorization';

type RuleAssignmentRow = Prisma.RuleOnCompanyGetPayload<{
  include: { rule: true };
}>;

interface RuleApplicability {
  readonly appliesToDosage: boolean;
  readonly appliesToCompliance: boolean;
  readonly notApplicableReason: string | null;
}

/**
 * Tool: list_effective_company_rules
 * Lists only rules assigned to a company and explains their effective status.
 */
export function createListEffectiveCompanyRulesTool(userId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'list_effective_company_rules',
    description: `Elenca le regole assegnate a una azienda e mostra quali sono effettivamente applicabili.
Usa questo tool prima del piano finale quando una company è nota.
Solo regole assegnate, ACTIVE, valide nelle date e con assegnazione attiva possono vincolare il dosaggio.
Le regole senza PDF/vectorizzazione possono influenzare configurazioni testuali ma non la validazione RAG PDF.`,
    schema: z.object({
      companyId: z.string().describe('ID della azienda target'),
      workspaceId: z.string().optional().describe('Limita la verifica a un workspace specifico'),
    }),
    func: async ({ companyId, workspaceId }) => {
      try {
        await assertCompanyAccess(userId, companyId);
        if (workspaceId) {
          await assertWorkspaceAccess(userId, workspaceId);
        }
        const assignments = await prisma.ruleOnCompany.findMany({
          where: buildWhere({ userId, companyId, workspaceId }),
          include: { rule: true },
          orderBy: [{ priority: 'asc' }, { assignedAt: 'desc' }],
        });
        const rules = assignments.map(mapAssignment);
        const effectiveRulesCount = rules.filter((rule) => rule.appliesToDosage).length;
        return JSON.stringify({
          companyId,
          workspaceId: workspaceId ?? null,
          rulesFound: rules.length,
          effectiveRulesCount,
          rules,
          message: buildMessage(rules.length, effectiveRulesCount),
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

function buildWhere(params: {
  readonly userId: string;
  readonly companyId: string;
  readonly workspaceId?: string;
}): Prisma.RuleOnCompanyWhereInput {
  if (params.workspaceId) {
    return { companyId: params.companyId, rule: { workspaceId: params.workspaceId } };
  }
  return {
    companyId: params.companyId,
    rule: { workspace: { members: { some: { userId: params.userId } } } },
  };
}

function mapAssignment(assignment: RuleAssignmentRow) {
  const applicability = getApplicability(assignment);
  return {
    assignmentId: assignment.id,
    ruleId: assignment.ruleId,
    name: assignment.rule.name,
    category: assignment.rule.category,
    status: assignment.rule.status,
    priority: assignment.priority,
    assignmentActive: assignment.isActive,
    validFrom: assignment.rule.validFrom,
    validUntil: assignment.rule.validUntil,
    region: assignment.rule.region,
    hasPdf: assignment.rule.pdfFileUrl !== null,
    pdfFileName: assignment.rule.pdfFileName,
    isVectorized: assignment.rule.isVectorized,
    vectorizedAt: assignment.rule.vectorizedAt,
    vectorizationError: assignment.rule.vectorizationError,
    appliesToDosage: applicability.appliesToDosage,
    appliesToCompliance: applicability.appliesToCompliance,
    notApplicableReason: applicability.notApplicableReason,
  };
}

function getApplicability(assignment: RuleAssignmentRow): RuleApplicability {
  const reasons = getNotApplicableReasons(assignment);
  const appliesToDosage = reasons.dosage.length === 0;
  const appliesToCompliance = appliesToDosage && reasons.compliance.length === 0;
  const allReasons = [...reasons.dosage, ...reasons.compliance];
  return {
    appliesToDosage,
    appliesToCompliance,
    notApplicableReason: allReasons.length > 0 ? allReasons.join('; ') : null,
  };
}

function getNotApplicableReasons(assignment: RuleAssignmentRow): {
  readonly dosage: readonly string[];
  readonly compliance: readonly string[];
} {
  const dosageReasons: string[] = [];
  if (!assignment.isActive) dosageReasons.push('assignment inactive');
  if (assignment.rule.status !== RuleStatus.ACTIVE) dosageReasons.push('rule status is not ACTIVE');
  if (!isWithinValidityWindow(assignment.rule.validFrom, assignment.rule.validUntil)) {
    dosageReasons.push('rule is outside its validity window');
  }
  const complianceReasons: string[] = [];
  if (assignment.rule.pdfFileUrl === null) complianceReasons.push('missing PDF');
  if (!assignment.rule.isVectorized) complianceReasons.push('PDF not vectorized');
  return { dosage: dosageReasons, compliance: complianceReasons };
}

function isWithinValidityWindow(validFrom: Date | null, validUntil: Date | null): boolean {
  const now = new Date();
  if (validFrom && now < validFrom) return false;
  if (validUntil && now > validUntil) return false;
  return true;
}

function buildMessage(total: number, effective: number): string {
  if (total === 0) {
    return 'Nessuna regola assegnata alla azienda target. Le regole workspace non assegnate non vincolano il dosaggio.';
  }
  if (effective === 0) {
    return 'Sono presenti assegnazioni, ma nessuna regola ACTIVE e valida risulta applicabile al dosaggio.';
  }
  return `Trovate ${effective} regole effettive su ${total} assegnazioni della azienda.`;
}
