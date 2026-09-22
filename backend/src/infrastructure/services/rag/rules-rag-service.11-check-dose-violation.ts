import { RuleCategory } from '@prisma/client';
import { RuleComplianceResult, RuleViolationDetail } from '../../../domain/dtos/rule-rag.types';
import type { RulesRagServiceContext } from './rules-rag-service.context';

export function rulesRagServiceCheckDoseViolation(this: RulesRagServiceContext, text: string, dose: number, doseUnit: string, result: RuleComplianceResult, ruleCategory: RuleCategory): RuleViolationDetail | null {
    const dosePatterns = [
      /dose\s*massima[:\s]*(\d+[.,]?\d*)\s*(kg|g|l|ml|kg\/ha|l\/ha|g\/hl|ml\/hl)/gi,
      /max[:\s]*(\d+[.,]?\d*)\s*(kg|g|l|ml|kg\/ha|l\/ha|g\/hl|ml\/hl)/gi,
    ];
    for (const pattern of dosePatterns) {
      const matches = text.matchAll(pattern);
      for (const match of matches) {
        const maxDose = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(maxDose) && dose > maxDose) {
          return {
            ruleId: result.ruleId,
            ruleName: result.ruleName,
            ruleCategory,
            violationType: 'DOSAGE_EXCEEDED',
            severity: 'CRITICAL',
            description: `Dose ${dose} ${doseUnit} exceeds maximum allowed ${maxDose} ${match[2]} from rule ${result.ruleName}`,
            suggestedAction: `Reduce dose to at most ${maxDose} ${match[2]}`,
            sourceChunk: result.relevantChunks[0]?.content?.substring(0, 200),
          };
        }
      }
    }
    return null;
  }
