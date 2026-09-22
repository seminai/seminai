/**
 * Treatment Strategy Planner
 *
 * Creates a coordinated treatment strategy across ALL products for a production unit
 * BEFORE individual product treatment planning. This enables the system to:
 * - Assign roles (backbone, alternation, targeted, supplementary) to each product
 * - Suggest application counts and periods per product
 * - Create coherent rotations (e.g., Delan as backbone + Revision alternation + Mavrik targeted)
 *
 * The output (TreatmentStrategyHint per product) is passed as guidance to planApplications().
 */

import { z } from 'zod';
import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LlmJobType } from '@prisma/client';
import type { DosageAgentContext } from './context';
import { callWithFallback, extractResponseText } from './llmProvider';
import type { CompleteCycle } from './treatmentDatePlanner';
import type { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { enrichDosageDetailsFromBdf } from './bdfDosageEnricher';

const usageLogger = LlmUsageLogger.getInstance();

export interface TreatmentStrategyHint {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly role: 'backbone' | 'alternation' | 'targeted' | 'supplementary';
  readonly suggestedApplicationCount: number;
  readonly suggestedPeriod: { readonly start: string; readonly end: string };
  readonly reasoning: string;
}

export interface TreatmentStrategyPlan {
  readonly strategies: ReadonlyArray<TreatmentStrategyHint>;
  readonly overallDescription: string;
}

const StrategySchema = z.object({
  strategies: z.array(
    z.object({
      productName: z.string(),
      registrationNumber: z.string(),
      role: z.enum(['backbone', 'alternation', 'targeted', 'supplementary']),
      suggestedApplicationCount: z.number(),
      suggestedPeriod: z.object({
        start: z.string(),
        end: z.string(),
      }),
      reasoning: z.string(),
    }),
  ),
  overallDescription: z.string(),
});

type AllowedProduct = UnitAllowedProductsOutput['products'][number];

function extractLabel(product: AllowedProduct): Label | null {
  const label = (product as { label?: unknown }).label;
  return label && isFitoLabel(label) ? label : null;
}

function extractRegNumber(product: AllowedProduct): string {
  return String((product as { regNumber?: string }).regNumber || '');
}

function extractName(product: AllowedProduct): string {
  return String((product as { name?: string }).name || '');
}

function extractQuantity(product: AllowedProduct): number {
  return (product as { quantity?: number }).quantity ?? 0;
}

function extractQuantityUom(product: AllowedProduct): string {
  return (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure ?? '';
}

/**
 * Build a product summary for the LLM prompt, including BDF-enriched dosage info.
 */
async function buildProductSummary(product: AllowedProduct, cropName: string): Promise<string> {
  const label = extractLabel(product);
  const name = extractName(product);
  const regNumber = extractRegNumber(product);
  const quantity = extractQuantity(product);
  const uom = extractQuantityUom(product);

  if (!label) {
    return `- ${name} (reg: ${regNumber}): Nessuna etichetta disponibile. Stock: ${quantity} ${uom}`;
  }

  // Get dosage details and enrich from BDF if needed
  const rawDosaggi = label.dosaggi_dettagliati || [];
  const dosaggi =
    rawDosaggi.length > 0
      ? await enrichDosageDetailsFromBdf(rawDosaggi, regNumber, name, cropName)
      : rawDosaggi;

  const nMaxApps = dosaggi
    .map((d) => d.n_max_applicazioni)
    .filter((v): v is number => typeof v === 'number' && v > 0);
  const maxApps = nMaxApps.length > 0 ? Math.max(...nMaxApps) : null;

  const diseases = label.malattie?.join(', ') || 'Non specificate';
  const category = label.categoria || 'Non specificata';
  const activeIngredient = label.principio_attivo || 'Non specificato';
  const frac = label.meccanismo_azione_frac || '';

  const parts = [
    `- ${name} (reg: ${regNumber})`,
    `  Categoria: ${category}`,
    `  Principio attivo: ${activeIngredient}${frac ? ` (FRAC/MoA: ${frac})` : ''}`,
    `  Malattie/Target: ${diseases}`,
    `  Max applicazioni: ${maxApps ?? 'Non specificato'}`,
    `  Stock disponibile: ${quantity} ${uom}`,
  ];

  return parts.join('\n');
}

/**
 * Plans a coordinated treatment strategy for all products in a production unit.
 * Returns per-product hints to guide individual treatment planning.
 *
 * If the LLM call fails, returns null (individual products will be planned without coordination).
 */
export async function planTreatmentStrategy(
  products: ReadonlyArray<AllowedProduct>,
  completeCycle: CompleteCycle,
  context?: DosageAgentContext,
  agronomicContext?: { agronomicNotes?: string; priorityTargets?: string[] },
): Promise<TreatmentStrategyPlan | null> {
  if (products.length <= 1) {
    // No need for cross-product strategy with a single product
    return null;
  }

  try {
    const tracker = usageLogger.createTracker();

    // Build product summaries (with BDF enrichment)
    const productSummaries = await Promise.all(
      products.map((p) => buildProductSummary(p, completeCycle.cropName)),
    );

    // Build product list for response mapping
    const productList = products.map((p) => ({
      name: extractName(p),
      regNumber: extractRegNumber(p),
    }));

    const agronomicNotesText = agronomicContext?.agronomicNotes
      ? `\nNOTE AGRONOMO: ${agronomicContext.agronomicNotes}`
      : '';
    const priorityTargetsText = agronomicContext?.priorityTargets?.length
      ? `\nAVVERSITÀ PRIORITARIE: ${agronomicContext.priorityTargets.join(', ')}`
      : '';

    const prompt = `Sei un agronomo esperto. Devi creare una STRATEGIA DI TRATTAMENTO COORDINATA per una unità produttiva, distribuendo i prodotti disponibili in modo agronomicamente sensato.

COLTURA: ${completeCycle.cropName} ${completeCycle.variety || ''}

CICLO FENOLOGICO:
- Inizio ciclo/Ripresa vegetativa: ${completeCycle.startDate.toISOString().split('T')[0]}
- Fioritura: ${completeCycle.floweringDate.toISOString().split('T')[0]}
- Raccolta: ${completeCycle.harvestingDate.toISOString().split('T')[0]}
- Fine ciclo: ${completeCycle.endDate.toISOString().split('T')[0]}
${agronomicNotesText}${priorityTargetsText}

PRODOTTI DISPONIBILI:
${productSummaries.join('\n\n')}

REGOLE DI STRATEGIA:
1. BACKBONE: Identifica il fungicida/prodotto di copertura principale da usare come "spina dorsale" della protezione. Questo prodotto deve avere il maggior numero di applicazioni, distribuite regolarmente nel periodo critico.
2. ALTERNAZIONE: Prodotti della stessa categoria ma con diverso meccanismo d'azione (FRAC) vanno alternati per prevenire resistenze.
3. TARGETED: Insetticidi, acaricidi e prodotti specifici vanno posizionati in momenti precisi (es. insetticida dopo fioritura).
4. SUPPLEMENTARY: Erbicidi e prodotti di supporto vanno pianificati separatamente.
5. Distribuisci lo stock disponibile in modo razionale su più applicazioni.
6. Per fungicidi di copertura su colture arboree, pianifica 4-8 applicazioni nel periodo critico (marzo-maggio per ticchiolatura melo, aprile-luglio per peronospora vite, ecc.).
7. Rispetta il max applicazioni da etichetta/BDF quando specificato.
8. NON essere conservativo: l'obiettivo è una protezione fitosanitaria ADEGUATA, non minimale.

Per ogni prodotto, assegna:
- role: "backbone" | "alternation" | "targeted" | "supplementary"
- suggestedApplicationCount: numero di applicazioni suggerite
- suggestedPeriod: { start: "YYYY-MM-DD", end: "YYYY-MM-DD" }
- reasoning: breve motivazione

Rispondi SOLO JSON:
{
  "strategies": [
    ${productList.map((p) => `{"productName":${JSON.stringify(p.name)},"registrationNumber":${JSON.stringify(p.regNumber)},"role":"...","suggestedApplicationCount":0,"suggestedPeriod":{"start":"YYYY-MM-DD","end":"YYYY-MM-DD"},"reasoning":"..."}`).join(',\n    ')}
  ],
  "overallDescription": "Descrizione breve della strategia complessiva"
}`;

    const { result: plan, usedModel } = await callWithFallback<TreatmentStrategyPlan>({
      operation: 'treatment-strategy',
      context,
      modelOptions: { temperature: 0 },
      execute: async (llm) => {
        const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
        const content = extractResponseText(response.content);

        // Parse JSON from response
        const cleaned = content.replace(/```json\n?|\n?```/g, '').trim();
        const firstBrace = cleaned.indexOf('{');
        if (firstBrace === -1) {
          throw new Error('No JSON found in LLM response');
        }

        let braceCount = 0;
        let lastBrace = -1;
        for (let i = firstBrace; i < cleaned.length; i++) {
          if (cleaned[i] === '{') braceCount++;
          else if (cleaned[i] === '}') {
            braceCount--;
            if (braceCount === 0) {
              lastBrace = i;
              break;
            }
          }
        }

        const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
        const json = JSON.parse(jsonStr);
        return StrategySchema.parse(json);
      },
    });

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.DOSAGE,
      model: usedModel,
      metadata: {
        step: 'treatment-strategy-planner',
        cropName: completeCycle.cropName,
        productCount: products.length,
      },
    });

    console.log(
      `[STRATEGY-PLANNER] Created strategy for ${completeCycle.cropName}: ${plan.overallDescription}`,
    );
    for (const s of plan.strategies) {
      console.log(
        `[STRATEGY-PLANNER]   ${s.productName}: ${s.role}, ${s.suggestedApplicationCount} apps, ${s.suggestedPeriod.start}-${s.suggestedPeriod.end}`,
      );
    }

    return plan;
  } catch (err) {
    console.warn(
      '[STRATEGY-PLANNER] Failed to create treatment strategy, continuing without:',
      err,
    );
    return null;
  }
}
