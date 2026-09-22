import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { prisma } from '../../../../repositories/Prisma';
import { ComputeFertilizerPlanUseCase } from '../../../../../application/use-cases/fertilizer/ComputeFertilizerPlanUseCase';
import type { PublicPlanResult } from '../../../../../domain/entities/fertilizer-plan/types';
import { getWorkingMemory, updateWorkingMemory } from '../working-memory';
import { TOOL_TIMEOUTS, withTimeout } from './timeout-utils';

interface CompactSummary {
  readonly unitId: string;
  readonly unitName: string;
  readonly cropName: string;
  readonly skipped: boolean;
  readonly skippedReason?: string;
  readonly feasible?: boolean;
  readonly usedGenericFallback?: boolean;
  readonly yieldScale?: number;
  readonly uncoveredNutrients?: ReadonlyArray<string>;
  readonly totalDoses?: Record<string, number>;
  readonly weeksPlanned?: number;
}

/**
 * Tool: fertilizer_plan
 * Computes the optimal fertilizer dosing schedule for the given production unit(s)
 * based on the crop nutrient demand and the configured yield. The raw demand and
 * yield values are private and never reach this tool — only the sanitized public
 * plan (doses + delta percentages) is returned.
 */
export function createFertilizerPlanTool(threadId: string): DynamicStructuredTool {
  return new DynamicStructuredTool({
    name: 'fertilizer_plan',
    description: `Genera il piano di fertilizzazione ottimale per le production unit indicate.
Sceglie il mix di prodotti FERTILIZER (con composizione nutritiva impostata) che soddisfa la richiesta della coltura
minimizzando il totale in kg/ha. Restituisce SOLO le dosi raccomandate per settimana e gli scostamenti percentuali
rispetto al fabbisogno (i valori assoluti di richiesta nutritiva e yield NON vengono mai esposti).

Parametri:
- productionUnitIds: opzionale; se omesso usa working memory inputUnits.
- fertilizerProductIds: opzionale; se omesso usa tutti i Product con category=FERTILIZER della company.
- actualYieldByUnitId: opzionale; mappa { productionUnitId: resaAttesa_t_per_ha }. Quando presente,
  scala la richiesta nutritiva proporzionalmente (resaUtente / resaDiCalibrazione). Se omesso, il piano
  è calibrato sulla resa di riferimento del dataset (scale 1.0). Da usare quando l'utente comunica
  esplicitamente la propria stima di resa per il ciclo.
- irrigation: fattore moltiplicativo per perdite/efficienza idrica (default 1).

Salva il risultato in working memory (fertilizerPlan).`,
    schema: z.object({
      productionUnitIds: z
        .array(z.string())
        .optional()
        .describe('UUIDs delle production unit. Se omesso, usa inputUnits della working memory.'),
      fertilizerProductIds: z
        .array(z.string())
        .optional()
        .describe(
          'UUIDs dei prodotti FERTILIZER da considerare. Se omesso, usa tutti quelli della company.',
        ),
      actualYieldByUnitId: z
        .record(z.string(), z.number().positive())
        .optional()
        .describe(
          'Resa attesa in t/ha per ciascuna production unit (chiave = productionUnitId). Scala il piano linearmente. Se omesso o per unit non presenti, usa la resa di calibrazione del dataset.',
        ),
      irrigation: z
        .number()
        .positive()
        .optional()
        .default(1)
        .describe('Fattore di irrigazione (>0). Default 1.'),
    }),
    func: async ({ productionUnitIds, fertilizerProductIds, actualYieldByUnitId, irrigation }) => {
      try {
        const resolvedUnitIds = resolveUnitIds(threadId, productionUnitIds);
        if (resolvedUnitIds.length === 0) {
          return JSON.stringify({
            error: 'Nessuna production unit specificata.',
            hint: 'Esegui prima list_production_units oppure passa productionUnitIds esplicitamente.',
          });
        }
        const useCase = new ComputeFertilizerPlanUseCase(prisma);
        const result = await withTimeout(
          () =>
            useCase.execute({
              productionUnitIds: resolvedUnitIds,
              fertilizerProductIds,
              actualYieldByUnitId,
              irrigation: irrigation ?? 1,
            }),
          TOOL_TIMEOUTS.FERTILIZER_PLAN,
          'fertilizer_plan',
        );
        updateWorkingMemory(threadId, { fertilizerPlan: result.plans });
        return JSON.stringify({
          unitsProcessed: result.unitsProcessed,
          plansPerUnit: result.plans.map(toCompactSummary),
          markdownTable: buildMarkdownTable(result.plans),
          workingMemoryKey: 'fertilizerPlan',
          message: buildHumanMessage(result.plans),
          renderingHint:
            'Mostra SEMPRE la tabella markdown nel messaggio. Riporta dosi totali per fertilizzante e settimane pianificate.',
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ error: msg });
      }
    },
  });
}

function resolveUnitIds(
  threadId: string,
  explicit: readonly string[] | undefined,
): readonly string[] {
  if (explicit && explicit.length > 0) return explicit;
  const wm = getWorkingMemory(threadId);
  const inputUnits = (wm.inputUnits ?? []) as ReadonlyArray<{ id?: string; unitId?: string }>;
  const ids = inputUnits.map((u) => u.id ?? u.unitId).filter((id): id is string => Boolean(id));
  return ids;
}

function toCompactSummary(unit: {
  unitId: string;
  unitName: string;
  cropName: string;
  plan: PublicPlanResult | null;
  fertilizerNamesById: Readonly<Record<string, string>>;
  skipped: boolean;
  skippedReason?: string;
}): CompactSummary {
  if (unit.skipped || !unit.plan) {
    return {
      unitId: unit.unitId,
      unitName: unit.unitName,
      cropName: unit.cropName,
      skipped: true,
      skippedReason: unit.skippedReason,
    };
  }
  const totalDosesByName = Object.entries(unit.plan.totalDoses).reduce<Record<string, number>>(
    (acc, [id, value]) => {
      acc[unit.fertilizerNamesById[id] ?? id] = value;
      return acc;
    },
    {},
  );
  return {
    unitId: unit.unitId,
    unitName: unit.unitName,
    cropName: unit.cropName,
    skipped: false,
    feasible: unit.plan.feasible,
    usedGenericFallback: unit.plan.usedGenericFallback,
    yieldScale: unit.plan.yieldScale,
    uncoveredNutrients: unit.plan.uncoveredNutrients,
    totalDoses: totalDosesByName,
    weeksPlanned: unit.plan.perWeek.length,
  };
}

function buildHumanMessage(
  plans: ReadonlyArray<{ skipped: boolean; plan: PublicPlanResult | null }>,
): string {
  const ok = plans.filter((p) => !p.skipped && p.plan?.feasible).length;
  const skipped = plans.filter((p) => p.skipped).length;
  const infeasible = plans.length - ok - skipped;
  return `Pianificate ${ok} unità (saltate ${skipped}, infattibili ${infeasible}).`;
}

interface PlanRow {
  readonly unitName: string;
  readonly cropName: string;
  readonly skipped: boolean;
  readonly skippedReason?: string;
  readonly plan: PublicPlanResult | null;
  readonly fertilizerNamesById: Readonly<Record<string, string>>;
}

function buildMarkdownTable(plans: ReadonlyArray<PlanRow>): string {
  const summary = renderSummaryTable(plans);
  const details = plans
    .filter((p): p is PlanRow & { plan: PublicPlanResult } => !p.skipped && p.plan !== null)
    .map(renderUnitDetail)
    .join('\n\n');
  return details.length > 0 ? `${summary}\n\n${details}` : summary;
}

function renderSummaryTable(plans: ReadonlyArray<PlanRow>): string {
  const header =
    '| Unità | Coltura | Stato | Scale | Settimane | Dosi totali (kg/ha) | Note |\n' +
    '| --- | --- | :---: | ---: | ---: | --- | --- |';
  const rows = plans.map((p) => {
    if (p.skipped || !p.plan) {
      return `| ${escapeCell(p.unitName)} | ${escapeCell(p.cropName || '—')} | ⚠️ saltata | — | — | — | ${escapeCell(p.skippedReason ?? '')} |`;
    }
    const status = p.plan.feasible ? '✅ ok' : '❌ infattibile';
    const totals = formatTotalDoses(p.plan.totalDoses, p.fertilizerNamesById);
    const scale = formatScale(p.plan.yieldScale);
    const notes = composeNotes(p.plan);
    return `| ${escapeCell(p.unitName)} | ${escapeCell(p.cropName)} | ${status} | ${scale} | ${p.plan.perWeek.length} | ${escapeCell(totals)} | ${escapeCell(notes)} |`;
  });
  const legend =
    "\n\n_Scale = moltiplicatore applicato alla calibrazione del dataset (1.00× = nessun aggiustamento; valori diversi = piano scalato sulla resa attesa fornita dall'utente)._";
  return `### Piano di fertilizzazione\n\n${header}\n${rows.join('\n')}${legend}`;
}

function formatScale(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  return `${value.toFixed(2)}×`;
}

function composeNotes(plan: PublicPlanResult): string {
  const notes: string[] = [];
  if (plan.usedGenericFallback) notes.push('fallback CSV generico');
  if (Math.abs(plan.yieldScale - 1) > 0.001) {
    notes.push(
      plan.yieldScale < 1
        ? 'piano ridotto sulla resa utente'
        : 'piano amplificato sulla resa utente',
    );
  }
  return notes.join('; ');
}

function renderUnitDetail(unit: PlanRow & { plan: PublicPlanResult }): string {
  const fertilizerIds = Object.keys(unit.plan.totalDoses);
  if (fertilizerIds.length === 0) return '';
  const fertilizerLabels = fertilizerIds.map((id) => unit.fertilizerNamesById[id] ?? id);
  const headerCells = ['Settimana', 'DDS', ...fertilizerLabels, 'Δ% N', 'Δ% P2O5', 'Δ% K2O'];
  const header = `| ${headerCells.join(' | ')} |\n| ${headerCells.map(() => '---').join(' | ')} |`;
  const rows = unit.plan.perWeek.map((week) => {
    const doses = fertilizerIds.map((id) => formatNumber(week.doses[id] ?? 0));
    const deltas = (['N', 'P2O5', 'K2O'] as const).map((k) => formatDelta(week.deltaPercents[k]));
    return `| ${week.week} | ${week.daysAfterSowing} | ${doses.join(' | ')} | ${deltas.join(' | ')} |`;
  });
  return `#### ${escapeCell(unit.unitName)} — ${escapeCell(unit.cropName)}\n\n${header}\n${rows.join('\n')}`;
}

function formatTotalDoses(
  totals: Readonly<Record<string, number>>,
  namesById: Readonly<Record<string, string>>,
): string {
  const entries = Object.entries(totals);
  if (entries.length === 0) return '—';
  return entries.map(([id, value]) => `${namesById[id] ?? id}: ${formatNumber(value)}`).join(', ');
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(2);
}

function formatDelta(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '—';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
