import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { planTreatmentStrategy } from '../../dosage_agent/treatmentStrategyPlanner';
import { getWorkingMemory, updateWorkingMemory, hasWorkingMemoryData } from '../working-memory';
import type { DosageAgentContext } from '../../dosage_agent/context';

/**
 * Tool: plan_treatment_strategy
 * Plans cross-product treatment strategy with role assignments and rotation.
 */
export function createPlanStrategyTool(
  threadId: string,
  context?: DosageAgentContext,
): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'plan_treatment_strategy',
    description: `Pianifica la strategia cross-prodotto per i trattamenti fitosanitari.
Assegna ruoli ai prodotti:
- backbone: prodotto principale per il controllo della malattia
- alternation: prodotto in rotazione per prevenire resistenze
- targeted: mirato a specifiche avversità/periodi
- supplementary: supplementare a bassa priorità
Richiede matchedProducts dalla working memory.
Salva il risultato in working memory (treatmentStrategy).`,
    schema: z.object({
      agronomicNotes: z
        .string()
        .optional()
        .describe(
          'Note agronomiche per il contesto (es. "Pressione oidio alta", "Evitare rame in fioritura")',
        ),
      priorityTargets: z
        .array(z.string())
        .optional()
        .describe('Avversità prioritarie da coprire (es. ["Peronospora", "Oidio"])'),
    }),
    func: async ({ agronomicNotes, priorityTargets }) => {
      try {
        if (!hasWorkingMemoryData(threadId, 'matchedProducts')) {
          return JSON.stringify({
            error: 'Prerequisito mancante: matchedProducts',
            hint: 'Eseguire prima search_products per abbinare prodotti a colture.',
          });
        }

        const wm = getWorkingMemory(threadId);
        const matchedProducts = [...(wm.matchedProducts ?? [])];

        // Process first unit (strategy is planned per-unit)
        const firstUnit = matchedProducts[0];
        if (!firstUnit || !firstUnit.products?.length) {
          return JSON.stringify({
            error: 'Nessun prodotto disponibile per la pianificazione strategica.',
          });
        }

        // Build a cycle from unit dates
        const completeCycle = {
          cropName: firstUnit.cropName ?? 'Coltura',
          variety: firstUnit.variety,
          startDate: firstUnit.startDate ? new Date(firstUnit.startDate) : new Date(),
          floweringDate: firstUnit.floweringDate ? new Date(firstUnit.floweringDate) : new Date(),
          harvestingDate: firstUnit.harvestingDate
            ? new Date(firstUnit.harvestingDate)
            : new Date(),
          endDate: firstUnit.endDate ? new Date(firstUnit.endDate) : new Date(),
        };

        const result = await planTreatmentStrategy(firstUnit.products, completeCycle, context, {
          agronomicNotes,
          priorityTargets,
        });

        if (!result) {
          return JSON.stringify({
            message:
              'Non è stato possibile generare una strategia di trattamento. Procedere con il calcolo dosaggi diretto.',
          });
        }

        updateWorkingMemory(threadId, { treatmentStrategy: result });

        return JSON.stringify({
          overallDescription: result.overallDescription,
          strategies: result.strategies.map((s: any) => ({
            product: s.productName,
            regNumber: s.registrationNumber,
            role: s.role,
            suggestedApplications: s.suggestedApplicationCount,
            period: s.suggestedPeriod,
            reasoning: s.reasoning,
          })),
          workingMemoryKey: 'treatmentStrategy',
          message: `Strategia pianificata per ${result.strategies.length} prodotti.`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}
