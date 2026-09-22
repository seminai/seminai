import { UnitAllowedProductsOutput } from './flowMatchCropTreatment';
import { flowOptimizeDosageLinearFunc, type DosageStrategy } from './flowOptimizeDosageLineareFunc';
import {
  normalizeStockQuantity,
  getEffectiveAreaHa,
  type BaseQuantityUnit,
} from './unitConversion';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import {
  planProductTreatments,
  findDosageDetails,
  buildCompleteCycle,
  type ProductionUnitCycle,
  type CompleteCycle,
} from './treatmentDatePlanner';
import { PlanningWindow } from './planningWindow';
import { checkDdtDateConformityBatch, type DdtDateCheckResult } from './ddtDateChecker';
import { DosageAgentContext } from './context';
import { mapWithLimit } from './parallelLimiter';
import { applyNMaxApplicationsLimit } from './checkNMaxApplication';
import type { ExcludedProduct, OrchestratorConfig } from './types';
import { checkProductRevoked, buildRevokedExclusionMessage } from './revokedProductChecker';
import { planTreatmentStrategy, type TreatmentStrategyHint } from './treatmentStrategyPlanner';

// OPTIMIZATION: Limit concurrent LLM calls to avoid rate limiting
const LLM_CONCURRENCY_LIMIT = 10;

interface TreatmentApplication {
  readonly data_distribuzione?: Date;
  readonly dose?: number;
  readonly epoca_impiego?: string;
  readonly isLocalizedTreatment?: boolean;
  readonly note?: string;
  readonly dosaggio_um?: string;
  readonly application?: string | null;
  readonly fasce_rispetto_acqua?: string | null;
  readonly fasce_rispetto_colture?: string | null;
  readonly ddt_date_is_ok?: boolean | null;
  readonly ddt_date_conformity?: string | null;
  readonly ddt_date_after_treatment?: boolean | null;
}

type AllowedProductBase = UnitAllowedProductsOutput['products'][number];
type UnitAllowedProductWithDosage = AllowedProductBase & {
  readonly trattamenti?: ReadonlyArray<TreatmentApplication>;
  readonly noTreatmentReason?: string;
};

export type UnitAllowedProductsWithDosageOutput = Omit<UnitAllowedProductsOutput, 'products'> & {
  readonly products: ReadonlyArray<UnitAllowedProductWithDosage>;
  /** Prodotti esclusi dalla selezione con motivazioni */
  readonly excludedProducts?: ReadonlyArray<ExcludedProduct>;
};

export interface ProductStockBalance {
  readonly productName: string;
  readonly regNumber: string;
  readonly quantityAvailable: number;
  readonly quantityUom: BaseQuantityUnit;
  readonly totalUsed: number;
  readonly balance: number;
  readonly isOverused: boolean;
  readonly percentageUsed: number;
  /** Giacenza da raggiungere specificata dall'utente (stessa UoM di quantityUom) */
  readonly targetStock?: number;
  /** Bilancio rispetto alla giacenza target: quantityAvailable - totalUsed - targetStock */
  readonly balanceVsTarget?: number;
  readonly unitBreakdown: ReadonlyArray<{
    readonly unitProductionId: string;
    readonly cropName?: string;
    readonly variety?: string;
    readonly areaHa?: number;
    readonly totalDoseForUnit: number;
    readonly applications: number;
  }>;
}

export interface StockBalanceReport {
  readonly timestamp: Date;
  readonly totalProducts: number;
  readonly productsOverused: number;
  readonly productsWithinLimit: number;
  readonly products: ReadonlyArray<ProductStockBalance>;
}

function extractLabel(product: AllowedProductBase): Label | null {
  const label = (product as { label?: unknown }).label;
  return label && isFitoLabel(label) ? label : null;
}

/**
 * Parse date string and fix potential DD-MM swap from LLM.
 * The LLM sometimes returns dates in YYYY-DD-MM instead of YYYY-MM-DD.
 *
 * Strategy:
 * 1. If day > 12, it's definitely in correct format (day can't be month)
 * 2. If day <= 12 and month > 12, the LLM swapped them - fix it
 * 3. If both <= 12, check if the date falls within the crop cycle
 *    - If original is outside cycle but swapped is inside, use swapped
 */
function parseAndFixDate(dateStr: string, cycleStart: Date, cycleEnd: Date): Date {
  const parsed = new Date(dateStr);
  if (Number.isNaN(parsed.getTime())) return parsed;

  // Extract components from ISO string YYYY-MM-DD
  const parts = dateStr.split('-');
  if (parts.length !== 3) return parsed;

  const year = Number(parts[0]);
  const firstNum = Number(parts[1]); // Could be month or day
  const secondNum = Number(parts[2]); // Could be day or month

  // Case 1: If second number > 12, format is correct (YYYY-MM-DD)
  if (secondNum > 12) {
    return parsed;
  }

  // Case 2: If first number > 12, LLM swapped them (YYYY-DD-MM)
  if (firstNum > 12) {
    const corrected = new Date(Date.UTC(year, secondNum - 1, firstNum));
    console.log(
      `[DATE-FIX] Swapped date: ${dateStr} -> ${corrected.toISOString().split('T')[0]} (day ${firstNum} > 12)`,
    );
    return corrected;
  }

  // Case 3: Both <= 12, ambiguous - check which makes sense for crop cycle
  // Extend cycle range by 2 months on each side for flexibility
  const extendedStart = new Date(cycleStart);
  extendedStart.setMonth(extendedStart.getMonth() - 2);
  const extendedEnd = new Date(cycleEnd);
  extendedEnd.setMonth(extendedEnd.getMonth() + 2);

  const originalDate = parsed;
  const swappedDate = new Date(Date.UTC(year, secondNum - 1, firstNum));

  const originalInRange = originalDate >= extendedStart && originalDate <= extendedEnd;
  const swappedInRange = swappedDate >= extendedStart && swappedDate <= extendedEnd;

  // If original is out of range but swapped is in range, use swapped
  if (!originalInRange && swappedInRange) {
    console.log(
      `[DATE-FIX] Swapped date: ${dateStr} -> ${swappedDate.toISOString().split('T')[0]} (outside cycle: ${cycleStart.toISOString().split('T')[0]} - ${cycleEnd.toISOString().split('T')[0]})`,
    );
    return swappedDate;
  }

  return originalDate;
}

function buildUnitCycle(unit: UnitAllowedProductsOutput): ProductionUnitCycle | null {
  const u = unit as {
    cropName?: string;
    variety?: string;
    location?: string;
    address?: string;
    startDate?: Date | string;
    floweringDate?: Date | string;
    harvestingDate?: Date | string;
    endDate?: Date | string;
  };
  if (!u.cropName) return null;

  const toDate = (v: Date | string | undefined): Date | undefined =>
    v instanceof Date ? v : typeof v === 'string' ? new Date(v) : undefined;

  return {
    cropName: u.cropName,
    variety: u.variety,
    location: u.location || u.address,
    startDate: toDate(u.startDate),
    floweringDate: toDate(u.floweringDate),
    harvestingDate: toDate(u.harvestingDate),
    endDate: toDate(u.endDate),
  };
}

async function getDosageUm(label: Label, cropName: string): Promise<string> {
  const details = await findDosageDetails(label, cropName, undefined, true);
  const detail = details[0];
  if (detail?.dose_um) return detail.dose_um;
  const form = (label.formulazione || label.categoria || '').toLowerCase();
  return form.includes('sc') || form.includes('ec') || form.includes('sl') ? 'L/ha' : 'kg/ha';
}

async function processProduct(
  product: AllowedProductBase,
  unit: UnitAllowedProductsOutput,
  completeCycle: CompleteCycle,
  planningWindow?: PlanningWindow,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
  strategyHint?: TreatmentStrategyHint,
  agronomicContext?: { agronomicNotes?: string; priorityTargets?: string[] },
): Promise<UnitAllowedProductWithDosage> {
  const label = extractLabel(product);
  const name = String((product as { name?: string }).name || '');
  const regNumber = String((product as { regNumber?: string }).regNumber || '');
  const productKey = `${name}|${regNumber}`;

  if (!label) {
    const reason = `Etichetta non disponibile per ${name}: impossibile calcolare dosaggi e trattamenti senza i dati di etichetta`;
    console.warn(`[DOSAGE-V2] No label for ${name}. Skip.`);
    if (historyManager) {
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Dosaggio: Label non disponibile',
        reason,
        DosageAgentStep.DOSAGE_SCHEDULING,
        DataSource.LABEL_EXTRACTION,
        {
          productionUnitId: unit.unitProductionId,
          cropName: completeCycle.cropName,
          productName: name,
          productRegistrationNumber: regNumber,
          description: reason,
        },
      );
    }
    return { ...product, trattamenti: undefined, noTreatmentReason: reason };
  }

  console.log(`[DOSAGE-V2] Processing product: ${name} for crop: ${completeCycle.cropName}`);
  const { dateRange, schedule } = await planProductTreatments(
    label,
    completeCycle,
    planningWindow,
    context,
    strategyHint,
    agronomicContext,
  );

  if (historyManager && dateRange) {
    historyManager.addEntry(
      unit.unitProductionId,
      productKey,
      'Date range determinato',
      `${dateRange.startDate} - ${dateRange.endDate}. ${dateRange.reason}`,
      DosageAgentStep.CROP_MATCHING,
      DataSource.LLM_OPENAI,
      {
        productionUnitId: unit.unitProductionId,
        cropName: completeCycle.cropName,
        productName: name,
      },
    );
  }

  if (!schedule || schedule.applications.length === 0) {
    const dateInfo = dateRange
      ? `nel periodo ${dateRange.startDate} - ${dateRange.endDate}`
      : 'perché non è stato possibile determinare un periodo di applicazione valido';
    const reason =
      `Nessuna applicazione pianificata per ${name} su ${completeCycle.cropName} ${dateInfo}. ${dateRange?.reason || ''}`.trim();
    console.warn(`[DOSAGE-V2] ${name}: no applications scheduled`);
    if (historyManager) {
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Dosaggio: Nessun trattamento pianificato',
        reason,
        DosageAgentStep.DOSAGE_SCHEDULING,
        DataSource.LLM_OPENAI,
        {
          productionUnitId: unit.unitProductionId,
          cropName: completeCycle.cropName,
          productName: name,
          productRegistrationNumber: regNumber,
          description: reason,
        },
      );
    }
    return { ...product, trattamenti: undefined, noTreatmentReason: reason };
  }

  const dosageUm = await getDosageUm(label, completeCycle.cropName);
  const dosageDetails = await findDosageDetails(label, completeCycle.cropName, undefined, true);

  // Enforce label max applications if present (hard clamp only when exceeded)
  const nMaxResult = applyNMaxApplicationsLimit({
    applications: schedule.applications,
    dosageDetails,
  });
  const effectiveApplications = nMaxResult.applications;
  if (nMaxResult.wasLimited) {
    console.warn(
      `[DOSAGE-V2] ${name}: applications trimmed to n_max_applicazioni=${nMaxResult.maxApplications} (${schedule.applications.length} -> ${effectiveApplications.length})`,
    );
    if (historyManager) {
      historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        'Applicazioni limitate da etichetta (n_max_applicazioni)',
        `${schedule.applications.length} -> ${effectiveApplications.length} (max=${nMaxResult.maxApplications})`,
        DosageAgentStep.DOSAGE_SCHEDULING,
        DataSource.AUTOMATIC_CALCULATION,
        {
          productionUnitId: unit.unitProductionId,
          cropName: completeCycle.cropName,
          productName: name,
          productRegistrationNumber: regNumber,
          description:
            'Applicazioni generate dal planner ridotte per rispettare il numero massimo di applicazioni indicato in etichetta.',
        },
      );
    }
  }

  // Prendi le fasce di rispetto direttamente dall'etichetta (già estratte durante label extraction)
  const fasceRispettoAcqua = label.fasce_rispetto_acqua?.trim() || null;
  const fasceRispettoColture = label.fasce_rispetto_colture?.trim() || null;

  const baseTreatments = effectiveApplications.map((app) => {
    // Trova il dosageDetail corrispondente basandosi sull'epoch (epoca_impiego)
    const matchingDetail = dosageDetails.find((detail) => {
      const detailEpoca = detail.epoca_impiego?.toLowerCase().trim() || '';
      const appEpoch = app.epoch?.toLowerCase().trim() || '';
      // Match esatto o parziale (l'epoch può essere più specifico dell'epoca_impiego)
      return (
        detailEpoca === appEpoch || appEpoch.includes(detailEpoca) || detailEpoca.includes(appEpoch)
      );
    });

    // Prendi le istruzioni dal dosageDetail corrispondente, o null se non presente
    const application = matchingDetail?.istruzioni?.trim() || null;

    return {
      data_distribuzione: parseAndFixDate(app.date, completeCycle.startDate, completeCycle.endDate),
      dose: undefined,
      epoca_impiego: app.epoch,
      isLocalizedTreatment: app.isLocalized,
      note: app.notes,
      dosaggio_um: dosageUm,
      application,
      fasce_rispetto_acqua: fasceRispettoAcqua,
      fasce_rispetto_colture: fasceRispettoColture,
    };
  });

  // Controllo conformità date DDT - check finale sui trattamenti creati
  let ddtCheckResults: DdtDateCheckResult[] = [];
  try {
    // Cerca il prodotto per nome (più affidabile di registrationNumber che spesso è null nel DB)
    ddtCheckResults = await checkDdtDateConformityBatch(baseTreatments, regNumber, undefined, name);
    console.log(
      `[DOSAGE-V2] ${name}: DDT date check completed for ${ddtCheckResults.length} treatments`,
    );
  } catch (error) {
    console.warn(`[DOSAGE-V2] ${name}: DDT date check failed`, error);
    // In caso di errore, tutti i risultati saranno null
    ddtCheckResults = baseTreatments.map(() => ({
      ddt_date_is_ok: null,
      ddt_date_conformity: null,
      ddt_date_after_treatment: null,
    }));
  }

  // Combina i trattamenti con i risultati del controllo DDT
  const trattamenti: TreatmentApplication[] = baseTreatments.map((treatment, index) => ({
    ...treatment,
    ddt_date_is_ok: ddtCheckResults[index]?.ddt_date_is_ok ?? null,
    ddt_date_conformity: ddtCheckResults[index]?.ddt_date_conformity ?? null,
    ddt_date_after_treatment: ddtCheckResults[index]?.ddt_date_after_treatment ?? null,
  }));

  if (historyManager) {
    historyManager.addEntry(
      unit.unitProductionId,
      productKey,
      'Trattamenti pianificati',
      `${trattamenti.length} applicazioni`,
      DosageAgentStep.DOSAGE_SCHEDULING,
      DataSource.LLM_OPENAI,
      {
        productionUnitId: unit.unitProductionId,
        cropName: completeCycle.cropName,
        productName: name,
      },
    );
  }

  console.log(
    `[DOSAGE-V2] ${name}: ${trattamenti.length} treatments for ${completeCycle.cropName}`,
  );
  return { ...product, trattamenti };
}

async function processUnit(
  unit: UnitAllowedProductsOutput,
  planningWindow?: PlanningWindow,
  historyManager?: JobHistoryManager,
  context?: DosageAgentContext,
  orchestratorConfig?: OrchestratorConfig,
): Promise<UnitAllowedProductsWithDosageOutput> {
  const unitCycle = buildUnitCycle(unit);
  if (!unitCycle) {
    return {
      ...unit,
      products: unit.products?.map((p) => ({ ...p, trattamenti: undefined })) ?? [],
      excludedProducts: (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts ?? [],
    };
  }

  console.log(`[DOSAGE-V2] Unit ${unit.unitProductionId} - ${unitCycle.cropName}`);

  // Build complete cycle ONCE per unit (not per product!)
  const rawCycle = await buildCompleteCycle(unitCycle, context);
  if (!rawCycle) {
    console.error(`[DOSAGE-V2] Cannot build cycle for ${unitCycle.cropName}`);
    return {
      ...unit,
      products: unit.products?.map((p) => ({ ...p, trattamenti: undefined })) ?? [],
      excludedProducts: (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts ?? [],
    };
  }

  const completeCycle = planningWindow ? planningWindow.shiftCycleToWindow(rawCycle) : rawCycle;

  console.log(
    `[DOSAGE-V2] Cycle built: ${completeCycle.startDate.toISOString().split('T')[0]} - ${completeCycle.endDate.toISOString().split('T')[0]}`,
  );

  // CHECK REVOKED PRODUCTS: Filter out revoked products before processing
  const validProducts: AllowedProductBase[] = [];
  const revokedExcluded: ExcludedProduct[] = [];

  for (let i = 0; i < (unit.products || []).length; i++) {
    const product = unit.products![i];
    const name = String((product as { name?: string }).name || '');
    const regNumber = String((product as { regNumber?: string }).regNumber || '');
    const category = (product as { label?: { categoria?: string } }).label?.categoria || null;

    const revokeCheck = checkProductRevoked(regNumber, name);

    if (revokeCheck.isRevoked && revokeCheck.info) {
      console.warn(
        `[DOSAGE-V2] Product "${name}" (reg: ${regNumber}) is REVOKED. Excluding from treatment.`,
      );

      revokedExcluded.push({
        index: i + 1,
        name,
        regNumber,
        exclusionReason: buildRevokedExclusionMessage(revokeCheck.info),
        category,
        product: { ...product, quantity: 0 },
      });

      if (historyManager) {
        historyManager.addEntry(
          unit.unitProductionId,
          `${name}|${regNumber}`,
          'Prodotto revocato',
          buildRevokedExclusionMessage(revokeCheck.info),
          DosageAgentStep.CROP_MATCHING,
          DataSource.AUTOMATIC_CALCULATION,
          {
            productionUnitId: unit.unitProductionId,
            cropName: unitCycle.cropName,
            productName: name,
            productRegistrationNumber: regNumber,
            description: 'Prodotto escluso perché revocato dal Ministero della Salute.',
          },
        );
      }
    } else {
      validProducts.push(product);
    }
  }

  if (revokedExcluded.length > 0) {
    console.log(
      `[DOSAGE-V2] Excluded ${revokedExcluded.length} revoked products, processing ${validProducts.length} valid products`,
    );
  }

  // Build agronomic context from orchestrator config
  const agronomicContext = orchestratorConfig
    ? {
        agronomicNotes: orchestratorConfig.agronomicNotes ?? undefined,
        priorityTargets: orchestratorConfig.priorityTargets
          ? [...orchestratorConfig.priorityTargets]
          : undefined,
      }
    : undefined;

  // CROSS-PRODUCT STRATEGY: Plan coordinated treatment strategy before individual products
  const strategyPlan = await planTreatmentStrategy(
    validProducts,
    completeCycle,
    context,
    agronomicContext,
  );

  if (strategyPlan) {
    console.log(
      `[DOSAGE-V2] Strategy: ${strategyPlan.overallDescription} (${strategyPlan.strategies.length} product hints)`,
    );
  }

  // OPTIMIZATION: Process products with limited concurrency to avoid LLM rate limiting
  const products = await mapWithLimit(
    validProducts,
    (p) => {
      const regNumber = String((p as { regNumber?: string }).regNumber || '');
      const hint = strategyPlan?.strategies.find((s) => s.registrationNumber === regNumber);
      return processProduct(
        p,
        unit,
        completeCycle,
        planningWindow,
        historyManager,
        context,
        hint,
        agronomicContext,
      );
    },
    LLM_CONCURRENCY_LIMIT,
  );

  // Preserve excludedProducts from orchestrator and add revoked products
  const existingExcluded =
    (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts ?? [];
  const excludedProducts = [...existingExcluded, ...revokedExcluded];

  return {
    unitProductionId: unit.unitProductionId,
    cycleId: unit.cycleId,
    cropName: unit.cropName,
    variety: unit.variety,
    areaHa: (unit as { areaHa?: number }).areaHa,
    jobs: unit.jobs ?? [],
    products,
    excludedProducts,
  };
}

/**
 * Main flow V2 - Two LLM prompts per product:
 * 1. determineDateRange - when can we apply?
 * 2. planApplications - how many times and when exactly?
 * OPTIMIZATION: Uses parallel processing with concurrency limits
 */
export const flowMatchProductionUnitTreatmentDosageV2 = async (
  input: ReadonlyArray<UnitAllowedProductsOutput>,
  strategy?: DosageStrategy,
  historyManager?: JobHistoryManager,
  outStockLimiter: boolean = false,
  planningWindow?: PlanningWindow,
  context?: DosageAgentContext,
  orchestratorConfig?: OrchestratorConfig,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> => {
  const start = Date.now();
  console.log(
    `[DOSAGE-V2] Starting for ${input.length} units with concurrency limit ${LLM_CONCURRENCY_LIMIT}`,
  );

  // OPTIMIZATION: Process units with limited concurrency
  // Note: Each unit processes its products in parallel (also limited),
  // so the effective concurrency is controlled at the product level
  const outputs = await mapWithLimit(
    input || [],
    (u) => processUnit(u, planningWindow, historyManager, context, orchestratorConfig),
    Math.min(5, input.length), // Limit units to 5 at a time, products are limited inside
  );

  console.log(`[DOSAGE-V2] Done in ${Date.now() - start}ms`);
  // Passa companyId dal context per recuperare lo stock aggregato dal DB
  const companyId = context?.companyId;
  return flowOptimizeDosageLinearFunc(
    outputs,
    strategy,
    historyManager,
    outStockLimiter,
    companyId,
  );
};

export const calculateStockBalance = (
  units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>,
): StockBalanceReport => {
  const map = new Map<
    string,
    {
      name: string;
      regNumber: string;
      quantityAvailable: number;
      quantityUom: BaseQuantityUnit;
      targetStock?: number;
      units: Array<{
        unitProductionId: string;
        cropName?: string;
        variety?: string;
        areaHa?: number;
        totalDoseForUnit: number;
        applications: number;
      }>;
    }
  >();

  for (const unit of units) {
    const unitAreaHa = unit.areaHa ?? 0;
    for (const product of unit.products || []) {
      const name = String((product as { name?: string }).name || '');
      const regNumber = String((product as { regNumber?: string }).regNumber || '');
      const key = `${name}|${regNumber}`;

      const effectiveAreaHa = getEffectiveAreaHa({
        unitAreaHa,
        treatedAreaHa: (product as { treatedAreaHa?: number }).treatedAreaHa,
        isLocalizedTreatment: (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment,
      });

      let totalDose = 0;
      let apps = 0;
      for (const t of product.trattamenti || []) {
        if (typeof t.dose === 'number' && effectiveAreaHa > 0) {
          totalDose += t.dose * effectiveAreaHa;
          apps++;
        }
      }

      if (!map.has(key)) {
        const qty = (product as { quantity?: number }).quantity ?? 0;
        const qtyUom = String(
          (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure || '',
        );
        const norm = normalizeStockQuantity(qty, qtyUom);
        const rawTargetStock = (product as { targetStock?: number }).targetStock;
        const targetStock =
          typeof rawTargetStock === 'number' &&
          Number.isFinite(rawTargetStock) &&
          rawTargetStock > 0
            ? normalizeStockQuantity(rawTargetStock, qtyUom).value
            : undefined;
        map.set(key, {
          name,
          regNumber,
          quantityAvailable: norm.value,
          quantityUom: norm.unit,
          targetStock,
          units: [],
        });
      }
      map.get(key)!.units.push({
        unitProductionId: unit.unitProductionId,
        cropName: unit.cropName,
        variety: unit.variety,
        areaHa: effectiveAreaHa,
        totalDoseForUnit: totalDose,
        applications: apps,
      });
    }
  }

  const products: ProductStockBalance[] = [];
  for (const [, d] of map) {
    const totalUsed = d.units.reduce((s, u) => s + u.totalDoseForUnit, 0);
    const balance = d.quantityAvailable - totalUsed;
    const balanceVsTarget =
      d.targetStock !== undefined ? d.quantityAvailable - totalUsed - d.targetStock : undefined;
    products.push({
      productName: d.name,
      regNumber: d.regNumber,
      quantityAvailable: d.quantityAvailable,
      quantityUom: d.quantityUom,
      totalUsed,
      balance,
      isOverused: balance < 0,
      percentageUsed: d.quantityAvailable > 0 ? (totalUsed / d.quantityAvailable) * 100 : 0,
      targetStock: d.targetStock,
      balanceVsTarget,
      unitBreakdown: d.units,
    });
  }

  return {
    timestamp: new Date(),
    totalProducts: products.length,
    productsOverused: products.filter((p) => p.isOverused).length,
    productsWithinLimit: products.filter((p) => !p.isOverused).length,
    products,
  };
};

export const printStockBalanceReport = (report: StockBalanceReport): void => {
  console.log('\n' + '='.repeat(80));
  console.log('REPORT BILANCIO GIACENZE MAGAZZINO');
  console.log('='.repeat(80));
  console.log(`Timestamp: ${report.timestamp.toISOString()}`);
  console.log(`Prodotti totali: ${report.totalProducts}`);
  console.log(`Prodotti in sforamento: ${report.productsOverused}`);
  console.log(`Prodotti entro limiti: ${report.productsWithinLimit}`);
  console.log('='.repeat(80));
  for (const product of report.products) {
    const statusIcon = product.isOverused ? '❌' : '✅';
    const statusText = product.isOverused ? 'SFORAMENTO' : 'OK';
    console.log(`\n${statusIcon} ${product.productName.toUpperCase()} (${product.regNumber})`);
    console.log(`   Disponibile: ${product.quantityAvailable.toFixed(2)} ${product.quantityUom}`);
    console.log(`   Utilizzato: ${product.totalUsed.toFixed(2)} ${product.quantityUom}`);
    console.log(
      `   Bilancio: ${product.balance.toFixed(2)} ${product.quantityUom} (${product.percentageUsed.toFixed(1)}% utilizzato)`,
    );
    if (product.targetStock !== undefined) {
      console.log(`   Giacenza target: ${product.targetStock.toFixed(2)} ${product.quantityUom}`);
      console.log(
        `   Bilancio vs target: ${product.balanceVsTarget?.toFixed(2) ?? 'N/A'} ${product.quantityUom}${(product.balanceVsTarget ?? 0) < 0 ? ' ⚠️ TARGET NON RAGGIUNTO' : ''}`,
      );
    }
    console.log(`   Stato: ${statusText}`);
    if (product.unitBreakdown.length > 0) {
      console.log(`   Dettaglio per unità produttive:`);
      for (const unit of product.unitBreakdown) {
        const cropInfo = unit.cropName
          ? `${unit.cropName}${unit.variety ? `/${unit.variety}` : ''}`
          : 'N/A';
        console.log(
          `     - Unit ${unit.unitProductionId} (${cropInfo}): ${unit.totalDoseForUnit.toFixed(2)} ${product.quantityUom} su ${unit.areaHa?.toFixed(2) || 'N/A'} ha (${unit.applications} applicazioni)`,
        );
      }
    }
  }
  console.log('\n' + '='.repeat(80));
  if (report.productsOverused > 0) {
    console.log('⚠️  ATTENZIONE: Alcuni prodotti hanno sforato le giacenze disponibili!');
  } else {
    console.log('✅ Tutti i prodotti sono entro i limiti delle giacenze disponibili.');
  }
  console.log('='.repeat(80) + '\n');
};

export { flowOptimizeDosageLinearFunc, type DosageStrategy };
