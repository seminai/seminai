import { RulesRagService } from '../../../infrastructure/services/rag/RulesRagService';
import { CompanyRulesService } from '../../../infrastructure/services/agents/dosage_agent/companyRulesService';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { AppError } from '../../../domain/errors/AppError';
import {
  buildAppliedRulesForProduct,
  citationsFromComplianceResults,
  groupViolationsByRule,
} from '../../../infrastructure/services/agents/dosage_agent/appliedRulesBuilder';
import type { AppliedRulePayload } from '../../../domain/dtos/applied-rules.dto';

/**
 * Inputs required to validate a manually-created job against the company's vectorized rules.
 * All product details must be provided explicitly: this use case does not perform DB lookups
 * to derive product/active ingredient — that's responsibility of the caller (controller).
 */
export interface ValidateManualJobComplianceInput {
  readonly userId: string;
  readonly companyId: string;
  readonly productName: string;
  readonly activeIngredient: string;
  readonly dose: number;
  readonly doseUnit: string;
  readonly applicationDate: Date;
  readonly cropName: string;
  readonly maxApplications?: number;
}

export interface ValidateManualJobComplianceOutput {
  readonly appliedRules: ReadonlyArray<AppliedRulePayload>;
}

/**
 * Validates a single manually-created job against the company's vectorized rule PDFs
 * and produces a structured AppliedRulePayload[] to persist on Job.appliedRules.
 *
 * Returns an empty array when no rules are assigned, no PDF is vectorized, or the RAG
 * query fails — the caller should still persist the job in those cases.
 */
export class ValidateManualJobComplianceUseCase {
  private readonly ragService: RulesRagService;
  private readonly companyRulesService: CompanyRulesService;

  constructor(private readonly userOnCompanyRepository: IUserOnCompanyRepository) {
    this.ragService = new RulesRagService();
    this.companyRulesService = new CompanyRulesService();
  }

  async execute(
    input: ValidateManualJobComplianceInput,
  ): Promise<ValidateManualJobComplianceOutput> {
    const membership = await this.userOnCompanyRepository.findByCompanyAndUser(
      input.companyId,
      input.userId,
    );
    if (!membership) {
      throw AppError.forbidden('You are not a member of this company', 'NOT_COMPANY_MEMBER');
    }

    const vectorizedRules = await this.companyRulesService.getVectorizedRulesForCompany(
      input.companyId,
    );
    if (vectorizedRules.length === 0) return { appliedRules: [] };

    const workspaceId = vectorizedRules[0].workspaceId;
    const companyRuleIds: ReadonlySet<string> = new Set(vectorizedRules.map((r) => r.id));

    const validation = await this.ragService.validateProductCompliance({
      companyId: input.companyId,
      workspaceId,
      productName: input.productName,
      activeIngredient: input.activeIngredient,
      dose: input.dose,
      doseUnit: input.doseUnit,
      applicationDate: input.applicationDate,
      cropName: input.cropName,
      maxApplications: input.maxApplications,
    });

    const ragResults = await this.ragService.queryRulesForCompliance({
      companyId: input.companyId,
      workspaceId,
      query: `${input.productName} ${input.activeIngredient} ${input.cropName} dose interventi limitazioni`,
      k: 8,
    });
    const citationsByRuleId = citationsFromComplianceResults(ragResults);
    const violationsByRuleId = groupViolationsByRule(validation.violations);

    const relevantRules = vectorizedRules.filter(
      (r) => violationsByRuleId.has(r.id) || (citationsByRuleId.get(r.id)?.length ?? 0) > 0,
    );

    const appliedRules = buildAppliedRulesForProduct({
      rules: relevantRules,
      companyRuleIds,
      violationsByRuleId,
      citationsByRuleId,
      adjustmentsByRuleId: new Map(),
    });

    return { appliedRules };
  }
}
