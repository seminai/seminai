import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { runConformityCheck } from '../../../conformity_checker_agent';
import type { ConformityCheckerContext } from '../../../conformity_checker_agent/context';
import type { DosageAgentContext } from '../../../dosage_agent/context';
import { updateWorkingMemory } from '../../working-memory';

const CONFORMITY_CHECK_TIMEOUT_MS = 300_000; // 5 minutes

function withTimeout<T>(fn: () => Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout after ${ms}ms`)), ms),
    ),
  ]);
}

/**
 * Tool: run_conformity_check
 * Wraps the deterministic conformity_checker_agent pipeline as a single tool.
 * Runs all checks (revocation, crop auth, dose range, N-max, compatibility,
 * buffer zones, rules compliance, SA group limits) and returns a summary.
 */
export function createRunConformityCheckTool(
  threadId: string,
  context?: DosageAgentContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'run_conformity_check',
    description: `Esegue una verifica COMPLETA di conformità su un gruppo di job esistenti nel database.
Controlla automaticamente: revoca prodotti, autorizzazione coltura, dose min/max etichetta,
N-max applicazioni, compatibilità principi attivi, fasce di rispetto, conformità disciplinare (RAG),
limiti gruppi sostanze attive. Produce proposte di correzione per ogni job.
Usare PRIMA di confirm_conformity_check per applicare le correzioni.
Input: jobGroupId (campo jobId nella tabella Job che raggruppa i job).`,
    schema: z.object({
      jobGroupId: z
        .string()
        .describe('ID del gruppo di job da verificare (campo jobId nella tabella Job)'),
      notes: z
        .string()
        .optional()
        .describe("Note agronomiche o regole aggiuntive fornite dall'utente"),
      skipRulesCompliance: z
        .boolean()
        .optional()
        .describe('Se true, salta la validazione disciplinare RAG (più veloce ma meno completa)'),
    }),
    func: async ({ jobGroupId, notes, skipRulesCompliance }) => {
      try {
        const conformityContext: ConformityCheckerContext | undefined = context?.userId
          ? {
              jobId: context.jobId ?? '',
              userId: context.userId,
              companyId: context.companyId,
            }
          : undefined;

        const result = await withTimeout(
          () => runConformityCheck({ jobGroupId, notes, skipRulesCompliance }, conformityContext),
          CONFORMITY_CHECK_TIMEOUT_MS,
          'run_conformity_check',
        );

        updateWorkingMemory(threadId, { conformityCheckResult: result });

        // Return summary only (not full proposals) to avoid token explosion
        const nonConformProposals = result.proposals.filter((p) => !p.isConform);
        const excludedProposals = result.proposals.filter((p) => p.shouldExclude);

        const violationSummary = nonConformProposals.flatMap((p) =>
          p.violations.map((v) => ({
            jobId: p.jobId,
            product: p.productName,
            type: v.type,
            severity: v.severity,
            message: v.message,
          })),
        );

        return JSON.stringify({
          jobGroupId: result.jobGroupId,
          summary: result.summary,
          checkedAt: result.checkedAt,
          warnings: result.warnings,
          userNotesAnalysis: result.userNotesAnalysis,
          nonConformJobs: nonConformProposals.map((p) => ({
            jobId: p.jobId,
            product: p.productName,
            isConform: p.isConform,
            shouldExclude: p.shouldExclude,
            exclusionReason: p.exclusionReason,
            originalQuantity: p.originalValues.quantity,
            proposedQuantity: p.proposedValues.quantity,
            violationCount: p.violations.length,
          })),
          excludedJobs: excludedProposals.map((p) => ({
            jobId: p.jobId,
            product: p.productName,
            reason: p.exclusionReason,
          })),
          topViolations: violationSummary.slice(0, 20),
          hint: 'Usa confirm_conformity_check per applicare le correzioni proposte.',
        });
      } catch (error) {
        return JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          hint: 'Verifica che il jobGroupId sia corretto e che i job esistano nel database.',
        });
      }
    },
  });
}
