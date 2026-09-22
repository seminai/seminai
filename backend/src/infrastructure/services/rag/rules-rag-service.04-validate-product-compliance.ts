import { ProductComplianceValidation, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import { ValidateProductParams } from './rules-rag-service.support';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export async function rulesRagServiceValidateProductCompliance(this: RulesRagServiceContext, params: ValidateProductParams): Promise<ProductComplianceValidation> {
    const {
      companyId,
      workspaceId,
      productName,
      activeIngredient,
      dose,
      doseUnit,
      applicationDate,
      cropName,
      maxApplications,
    } = params;
    const queries = this.buildComplianceQueries({
      productName,
      activeIngredient,
      dose,
      doseUnit,
      applicationDate,
      cropName,
      maxApplications,
    });
    const allViolations: RuleViolationDetail[] = [];
    const compliantRules: string[] = [];
    const recommendations: string[] = [];
    let totalScore = 0;
    let queryCount = 0;
    for (const queryInfo of queries) {
      const results = await this.queryRulesForCompliance({
        companyId,
        workspaceId,
        query: queryInfo.query,
        k: 5,
      });
      for (const result of results) {
        totalScore += result.score;
        queryCount++;
        const violations = this.analyzeChunksForViolations(result, queryInfo.type, params);
        if (violations.length > 0) {
          allViolations.push(...violations);
        } else {
          if (!compliantRules.includes(result.ruleName)) {
            compliantRules.push(result.ruleName);
          }
        }
      }
    }
    const overallScore = queryCount > 0 ? totalScore / queryCount : 0;
    const isCompliant = allViolations.every((v) => v.severity !== 'CRITICAL');
    return {
      isCompliant,
      overallScore,
      violations: allViolations,
      compliantRules,
      recommendations,
    };
  }
