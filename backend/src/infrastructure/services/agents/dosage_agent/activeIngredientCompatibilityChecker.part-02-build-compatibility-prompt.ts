import { z } from 'zod';
import { DosageAgentContext, hasContext } from './context';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { callWithFallback, extractResponseText } from './llmProvider';
import { LlmJobType } from '@prisma/client';
import { DosageLoggerService } from '../../dosage-logger.service';
import { ProductWithLabel, extractActiveIngredientFromLabel, extractChemicalFamily, extractResistanceWarnings, usageLogger } from './activeIngredientCompatibilityChecker.part-01-usage-logger';

/**
 * Builds prompt for LLM compatibility check
 */
export function buildCompatibilityPrompt(products: ReadonlyArray<ProductWithLabel>): string {
  const productDescriptions = products
    .map((p, idx) => {
      const ai = extractActiveIngredientFromLabel(p.label);
      const cf = extractChemicalFamily(p.label);
      const resistances = extractResistanceWarnings(p.label);
      const resistanceText =
        resistances.length > 0
          ? resistances
              .map((r) => {
                const parts = [];
                if (r.prodotti_da_evitare?.length) {
                  parts.push(`Prodotti da evitare: ${r.prodotti_da_evitare.join(', ')}`);
                }
                if (r.famiglie_chimiche_da_evitare?.length) {
                  parts.push(`Famiglie da evitare: ${r.famiglie_chimiche_da_evitare.join(', ')}`);
                }
                if (r.raccomandazioni) {
                  parts.push(`Raccomandazioni: ${r.raccomandazioni}`);
                }
                return parts.join('. ');
              })
              .join(' | ')
          : 'Nessuna';
      const compatibilityNote = p.label?.compatibilita || 'Non specificata';
      return `${idx + 1}. "${p.name}" (Reg: ${p.regNumber})
   - Principio attivo: ${ai || 'Non disponibile'}
   - Meccanismo d'azione/FRAC: ${cf || 'Non disponibile'}
   - Categoria: ${p.label?.categoria || 'Non disponibile'}
   - Compatibilità dichiarata: ${compatibilityNote}
   - Avvertenze resistenze: ${resistanceText}`;
    })
    .join('\n\n');

  return `Sei un agronomo esperto in fitofarmaci. Analizza la compatibilità tra i seguenti prodotti fitosanitari che saranno applicati sullo stesso campo.

PRODOTTI DA ANALIZZARE:
${productDescriptions}

ANALISI RICHIESTA:
1. INCOMPATIBILITÀ CHIMICHE: Identifica prodotti che NON possono essere miscelati o applicati insieme a causa di:
   - Interazioni chimiche negative tra principi attivi
   - Avvertenze esplicite nelle resistenze (prodotti_da_evitare, famiglie_chimiche_da_evitare)
   - Note di compatibilità che escludono altri prodotti

2. Per ogni incompatibilità trovata, indica:
   - Quale prodotto MANTENERE (con motivazione)
   - Quale prodotto ESCLUDERE (dose = 0)

IMPORTANTE - NON ESCLUDERE SOSTITUTI:
- Prodotti con lo stesso principio attivo o meccanismo d'azione NON devono essere esclusi automaticamente.
- L'utente ha scelto questi prodotti intenzionalmente. Mantienili tutti a meno che non ci sia una reale incompatibilità chimica.
- Prodotti con stesso principio attivo possono coesistere: i limiti SA vengono gestiti separatamente.

Rispondi in JSON con questo formato esatto:
{
  "analysis": [
    {
      "productName": "nome prodotto",
      "regNumber": "numero registrazione",
      "decision": "KEEP" | "EXCLUDE",
      "reason": "motivazione dettagliata",
      "incompatibleWith": ["lista prodotti incompatibili"] | null,
      "isSubstituteOf": null
    }
  ],
  "summary": "Riepilogo delle decisioni prese",
  "totalExcluded": numero
}

IMPORTANTE:
- Se non ci sono incompatibilità chimiche reali, tutti i prodotti devono avere decision="KEEP"
- NON escludere prodotti solo perché condividono lo stesso principio attivo
- Documenta sempre il motivo dell'esclusione per tracciabilità`;
}

export const LlmCompatibilityResultSchema = z.object({
  analysis: z.array(
    z.object({
      productName: z.string(),
      regNumber: z.string(),
      decision: z.enum(['KEEP', 'EXCLUDE']),
      reason: z.string(),
      incompatibleWith: z.array(z.string()).nullable(),
      isSubstituteOf: z.string().nullable(),
    }),
  ),
  summary: z.string(),
  totalExcluded: z.number().int().min(0),
});

export type LlmCompatibilityResult = z.infer<typeof LlmCompatibilityResultSchema>;

/**
 * Invokes LLM for compatibility check
 */
export async function invokeLlmCompatibilityCheck(
  products: ReadonlyArray<ProductWithLabel>,
  context?: DosageAgentContext,
): Promise<LlmCompatibilityResult | null> {
  if (products.length < 2) {
    // No need to check compatibility with single product
    return null;
  }

  const prompt = buildCompatibilityPrompt(products);

  try {
    console.log(`[COMPATIBILITY-CHECK] Invoking LLM for ${products.length} products`);
    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);

    const { result: parsed, usedModel } = await callWithFallback<LlmCompatibilityResult | null>({
      operation: 'compatibility-check',
      context,
      modelOptions: { temperature: 0.1, maxTokens: 4000 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: [usageCollector] });
        const content = extractResponseText(response.content);

        // Extract JSON from response
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn('[COMPATIBILITY-CHECK] Could not extract JSON from LLM response');
          return null;
        }

        const rawParsed = JSON.parse(jsonMatch[0]);
        const validation = LlmCompatibilityResultSchema.safeParse(rawParsed);
        if (!validation.success) {
          console.warn(
            `[COMPATIBILITY-CHECK] LLM response failed schema validation: ${validation.error.message}`,
          );
          return null;
        }
        return validation.data;
      },
    });

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        userId: context?.userId,
        companyId: context?.companyId,
        jobId: context?.jobId,
        jobGroupId: context?.jobGroupId,
        jobType: context?.jobType ?? LlmJobType.DOSAGE,
        model: usedModel,
        metadata: { step: 'active-ingredient-compatibility-check', productCount: products.length },
      })
      .catch((err) => console.warn('[COMPATIBILITY-CHECK] Failed to log usage:', err));

    if (parsed && hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logFlow({
        jobId: context.jobId,
        userId: context.userId,
        message: `Compatibility check completed: ${parsed.totalExcluded} products excluded`,
        metadata: { summary: parsed.summary },
      });
    }

    return parsed;
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error);
    console.error(`[COMPATIBILITY-CHECK] LLM error: ${errMsg}`);
    return null;
  }
}
