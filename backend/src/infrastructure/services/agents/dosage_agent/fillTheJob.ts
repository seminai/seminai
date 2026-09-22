import { JobCategory, ProductCategory } from '@prisma/client';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { InputDosageAgent } from './index';
import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import {
  UnitScheduledJob,
  UnitJobStockSummary,
  UnitJobStockProductSummary,
} from './flowMatchCropTreatment';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../../../repositories/PrismaStockRepository';
import { PrismaProductRepository } from '../../../repositories/PrismaProductRepository';
import { CreateJobUseCase } from '../../../../application/use-cases/job/CreateJobUseCase';
import { CreateProductUseCase } from '../../../../application/use-cases/product/CreateProductUseCase';
import { CreateStockProps } from '../../../../domain/dtos/stock.dto';
import { Stock } from '../../../../domain/entities/Stock';
import { prisma } from '../../../repositories/Prisma';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { cleanRegNumber } from './cleanRegNumber';
import { AlertNotesDTO } from '../../../../domain/dtos/alert-notes.dto';
import {
  RuleViolationDetail,
  DisciplinareActiveIngredientInfo,
} from '../../../../domain/dtos/rule-rag.types';
import type { AppliedRulePayload } from '../../../../domain/dtos/applied-rules.dto';
import { buildAppliedRulesKey } from './flowValidateRulesCompliance';
import { Label, LabelDoseDetail, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { calculateAggregatedStock } from './stockAggregator';
import {
  roundQuantity,
  convertDoseToHl,
  calculateWaterForJob,
  getEffectiveAreaHa,
} from './unitConversion';
import type { ExcludedProduct } from './types';
import { BatchLoaderContext, ensureWarehouseForCompany } from './batchLoader';
import { alertNotesToJson, historyToJson, excludedProductInfoToJson } from './typeGuards';
import { buildDisciplinareInfoKey } from './productAccessors';
import {
  parseProductName,
  resolveOfficialName,
  convertPiecesToRealUnit,
  isPiecesUnit,
} from '../../../services/utils/ProductNameParser';

type RequestedProduct = InputDosageAgent['products'][number];

// Note: resolveCycleId function moved to batchLoader.ts as resolveCycleIdFromCache
// to support batch loading and prevent N+1 queries

interface FillTheJobInput {
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly requestedProducts?: ReadonlyArray<RequestedProduct>;
  readonly queueJobId?: string;
  readonly historyManager?: JobHistoryManager;
  readonly ruleViolations?: ReadonlyArray<RuleViolationDetail>;
  readonly disciplinareInfoMap?: Map<string, ReadonlyArray<DisciplinareActiveIngredientInfo>>;
  /** Applied rules per (productionUnitId|productName) — populated by flowValidateRulesCompliance */
  readonly appliedRulesByProduct?: ReadonlyMap<string, ReadonlyArray<AppliedRulePayload>>;
  /** machineId da associare a tutti i job creati */
  readonly machineId?: string | null;
  /** userId (operatore) da associare a tutti i job creati */
  readonly operatorId?: string | null;
}

interface FillTheJobOutput {
  readonly jobsByUnit: Map<string, ReadonlyArray<UnitScheduledJob>>;
  readonly warnings: ReadonlyArray<string>;
}

type JobWithStocksAndProduct = Prisma.JobGetPayload<{
  include: { stocks: { include: { product: true } } };
}>;

interface ProductSummary {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly registrationNumber: string | null;
  readonly category: ProductCategory;
}

interface ProductionUnitMetadata {
  readonly productionUnitId: string;
  readonly productionUnitName: string | null;
  readonly companyId: string | null;
  readonly companyName: string | null;
  readonly warehouseId: string | null;
}

const DEFAULT_PRICE_UNIT = 'EUR';
const STOCK_IN_TYPE = 'IN';
const STOCK_OUT_TYPE = 'OUT';

function parseDate(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function normalizeQuantityUnit(unit?: string | null): string {
  if (!unit) {
    return 'kg';
  }
  const normalized = unit.toLowerCase().trim();
  if (normalized.includes('kg')) {
    return 'kg';
  }
  if (normalized.includes('l')) {
    return 'L';
  }
  if (normalized.includes('g')) {
    return 'g';
  }
  return unit;
}

function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

function normalizeRegistrationNumber(value?: string | null): string {
  const raw = String(value ?? '').trim();
  if (!raw || !/\d/.test(raw)) {
    return '';
  }
  return cleanRegNumber(raw);
}

/**
 * Extracts label from product object if available.
 */
function extractLabelFromProduct(product: unknown): Label | null {
  const labelCandidate = (product as { label?: unknown }).label;
  if (labelCandidate && isFitoLabel(labelCandidate)) {
    return labelCandidate;
  }
  return null;
}

/**
 * Finds the best matching dose detail for a given crop.
 */
function findMatchingDoseDetail(
  label: Label,
  cropName?: string,
  variety?: string,
): LabelDoseDetail | null {
  if (!label.dosaggi_dettagliati || label.dosaggi_dettagliati.length === 0) {
    return null;
  }
  const normalizedCrop = normalizeName(cropName ?? '');
  const normalizedVariety = normalizeName(variety ?? '');
  for (const dose of label.dosaggi_dettagliati) {
    const normalizedColtura = normalizeName(dose.coltura ?? '');
    if (
      normalizedColtura === normalizedCrop ||
      normalizedColtura.includes(normalizedCrop) ||
      normalizedCrop.includes(normalizedColtura) ||
      normalizedColtura === normalizedVariety ||
      normalizedColtura.includes(normalizedVariety) ||
      normalizedVariety.includes(normalizedColtura)
    ) {
      return dose;
    }
  }
  return label.dosaggi_dettagliati[0] ?? null;
}

interface BuildAlertNotesParams {
  readonly label: Label | null;
  readonly treatment: {
    readonly epoca_impiego?: string | null;
    readonly fasce_rispetto_acqua?: string | null;
    readonly fasce_rispetto_colture?: string | null;
    readonly application?: string | null;
    readonly ddt_date_is_ok?: boolean | null;
    readonly ddt_date_conformity?: string | null;
    readonly ddt_date_after_treatment?: boolean | null;
  };
  readonly cropName?: string;
  readonly variety?: string;
  readonly totalStockRequired: number;
  readonly quantityUnit: string;
  readonly initialStockBalance: number;
  readonly treatedSurface: number | null;
  readonly ruleViolations?: ReadonlyArray<RuleViolationDetail>;
  readonly disciplinareInfo?: ReadonlyArray<DisciplinareActiveIngredientInfo> | null;
}

/**
 * Builds AlertNotesDTO from label data and LLM-selected values.
 * Stock out calculation: if totalStockRequired > initialStockBalance, the difference is stock_out.
 */
function buildAlertNotes(params: BuildAlertNotesParams): AlertNotesDTO {
  const {
    label,
    treatment,
    cropName,
    variety,
    totalStockRequired,
    quantityUnit,
    initialStockBalance,
    treatedSurface,
  } = params;
  const doseDetail = label ? findMatchingDoseDetail(label, cropName, variety) : null;
  // Stock out = totale richiesto per tutti i job - stock disponibile iniziale
  // Se positivo, c'è stock out. Se negativo o zero, non c'è stock out.
  const stockOutAmount = totalStockRequired - initialStockBalance;
  const isStockOut = stockOutAmount > 0;
  // Calculate water for the job
  const waterValues = calculateWaterForJob({
    acquaMax: doseDetail?.acqua_max,
    acquaMaxUm: doseDetail?.acqua_max_um,
    treatedSurface,
  });
  // Calculate doses in hectoliters (only for fluids)
  const doseMinHlJob = convertDoseToHl({
    dose: doseDetail?.dose_minima,
    doseUm: doseDetail?.dose_um,
    treatedSurface,
  });
  const doseMaxHlJob = convertDoseToHl({
    dose: doseDetail?.dose_massima,
    doseUm: doseDetail?.dose_um,
    treatedSurface,
  });
  return {
    frasi_pericolo:
      label?.frasi_pericolo && label.frasi_pericolo.length > 0 ? label.frasi_pericolo : null,
    modalita_applicazione: doseDetail?.modalita_applicazione ?? null,
    n_max_applicazioni: doseDetail?.n_max_applicazioni ?? null,
    n_max_applicazioni_um: doseDetail?.n_max_applicazioni_um ?? null,
    dose_minima: doseDetail?.dose_minima ?? null,
    dose_massima: doseDetail?.dose_massima ?? null,
    dose_um: doseDetail?.dose_um ?? null,
    acqua_max: doseDetail?.acqua_max ?? null,
    acqua_max_um: doseDetail?.acqua_max_um ?? null,
    epoca_impiego: doseDetail?.epoca_impiego ?? null,
    note_tecniche: label?.note_tecniche ?? null,
    epoca_impiego_llm: treatment.epoca_impiego ?? treatment.application ?? null,
    fasce_di_rispetto_e_deriva:
      label?.fasce_di_rispetto_e_deriva && label.fasce_di_rispetto_e_deriva.length > 0
        ? label.fasce_di_rispetto_e_deriva
        : null,
    fasce_rispetto_acqua: label?.fasce_rispetto_acqua ?? null,
    fasce_rispetto_colture: label?.fasce_rispetto_colture ?? null,
    fasce_di_rispetto_e_deriva_llm:
      treatment.fasce_rispetto_acqua || treatment.fasce_rispetto_colture
        ? [treatment.fasce_rispetto_acqua, treatment.fasce_rispetto_colture]
            .filter(Boolean)
            .join('; ')
        : null,
    colture_target_fuori_periodo_di_produzione:
      label?.colture_target_fuori_periodo_di_prodizione &&
      label.colture_target_fuori_periodo_di_prodizione.length > 0
        ? label.colture_target_fuori_periodo_di_prodizione
        : null,
    colture_target_fuori_periodo_di_produzione_llm: null,
    resistenze: label?.resistenze && label.resistenze.length > 0 ? label.resistenze : null,
    resistenze_llm: null,
    malattie: label?.malattie && label.malattie.length > 0 ? label.malattie : null,
    total_stock_required_for_jobs:
      totalStockRequired > 0 ? roundQuantity(totalStockRequired) : null,
    total_stock_required_for_jobs_um: totalStockRequired > 0 ? quantityUnit : null,
    stock_out: isStockOut ? roundQuantity(stockOutAmount) : null,
    stock_out_um: isStockOut ? quantityUnit : null,
    stock_in_warehouse: initialStockBalance > 0 ? roundQuantity(initialStockBalance) : null,
    stock_in_warehouse_um: initialStockBalance > 0 ? quantityUnit : null,
    ddt_date_is_ok: treatment.ddt_date_is_ok ?? null,
    ddt_date_conformity: treatment.ddt_date_conformity ?? null,
    ddt_date_after_treatment: treatment.ddt_date_after_treatment ?? null,
    waterHlJob: waterValues.waterHlJob,
    acquaMaxJob: waterValues.acquaMaxJob,
    acquaMaxJob_um: waterValues.acquaMaxJob_um,
    principio_attivo: label?.principio_attivo ?? null,
    dose_minima_hl_job: doseMinHlJob,
    dose_massima_hl_job: doseMaxHlJob,
    ruleViolations:
      params.ruleViolations && params.ruleViolations.length > 0 ? params.ruleViolations : null,
    ruleComplianceNotes:
      params.ruleViolations && params.ruleViolations.length > 0
        ? formatRuleViolationsAsText(params.ruleViolations)
        : null,
    disciplinare_info:
      params.disciplinareInfo && params.disciplinareInfo.length > 0
        ? params.disciplinareInfo
        : null,
  };
}

/**
 * Formats rule violations into a human-readable text for alert notes.
 */
function formatRuleViolationsAsText(violations: ReadonlyArray<RuleViolationDetail>): string | null {
  if (!violations || violations.length === 0) return null;
  return violations
    .map(
      (v) =>
        `[${v.severity}] ${v.ruleName} (${v.ruleCategory}): ${v.description}` +
        (v.suggestedAction ? ` - ${v.suggestedAction}` : ''),
    )
    .join('\n');
}

// Products arriving here are loosely typed objects coming from multiple flows (label extraction,
// matching, LLM). We keep the parameter as `unknown` on purpose and pluck only the fields we need,
// instead of pretending we have a strict DTO.
function extractIncomingStock(
  product: unknown,
): { quantity: number; unitOfMeasure: string } | null {
  // Crea stock IN SOLO se loadWarehouse === true (esplicitamente richiesto).
  // Se loadWarehouse è false o undefined/assente, NON creare STOCK_IN.
  const loadWarehouseFlag = (product as { loadWarehouse?: boolean }).loadWarehouse;
  if (loadWarehouseFlag !== true) {
    return null;
  }
  const quantity =
    typeof (product as { quantity?: number }).quantity === 'number'
      ? (product as { quantity: number }).quantity
      : undefined;
  if (!quantity || quantity <= 0) {
    return null;
  }
  const unit = normalizeQuantityUnit(
    (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure ?? null,
  );
  return { quantity, unitOfMeasure: unit };
}

function mapJob(job: JobWithStocksAndProduct): UnitScheduledJob {
  const stocks: UnitJobStockSummary[] = job.stocks.map((stock) => {
    const product: UnitJobStockProductSummary = {
      id: stock.product.id,
      name: stock.product.name,
      sku: stock.product.sku,
      registrationNumber: stock.product.registrationNumber ?? null,
      category: stock.product.category,
    };
    return {
      id: stock.id,
      productId: stock.productId,
      quantity: stock.quantity,
      unitOfMeasureQuantity: stock.unitOfMeasureQuantity,
      price: stock.price,
      unitOfMeasurePrice: stock.unitOfMeasurePrice,
      type: stock.type,
      product,
    };
  });

  return {
    id: job.id,
    jobId: job.jobId ?? null,
    productionUnitId: job.productionUnitId,
    dateOfOpeation: job.dateOfOpeation,
    isVerified: job.isVerified,
    category: job.category,
    quantity: job.quantity,
    unitOfMeasureQuantity: job.unitOfMeasureQuantity,
    productQuantityTreated: job.productQuantityTreated,
    unitOfMeasureProductQuantityTreated: job.unitOfMeasureProductQuantityTreated,
    modeOfApplication: job.modeOfApplication,
    avversity: job.avversity,
    giustification: job.giustification,
    treatedSurface: job.treatedSurface,
    isLocalizedTreatment: job.isLocalizedTreatment,
    userId: job.userId,
    note: job.note,
    totalDistributedWaterL: job.totalDistributedWaterL,
    machineId: job.machineId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    stocks,
  };
}

async function resolveProductionUnitMetadata(
  prisma: PrismaClient,
  productionUnitId: string,
  cache: Map<string, ProductionUnitMetadata>,
): Promise<ProductionUnitMetadata> {
  const cached = cache.get(productionUnitId);
  if (cached) {
    return cached;
  }

  const productionUnit = await prisma.productionUnit.findUnique({
    where: { id: productionUnitId },
    include: {
      productionUnitsOnFields: {
        include: {
          field: {
            select: {
              companyId: true,
              company: {
                select: {
                  name: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const productionUnitName = productionUnit?.name ?? null;
  const firstRelation = productionUnit?.productionUnitsOnFields.find(
    (relation) => relation.field?.companyId,
  );
  const companyId = firstRelation?.field?.companyId ?? null;
  const companyName = firstRelation?.field?.company?.name ?? null;

  let warehouseId: string | null = null;
  if (companyId) {
    const warehouses = await prisma.warehouse.findMany({
      where: { companyId },
      select: { id: true },
      take: 1,
    });

    if (warehouses.length === 0) {
      console.log(
        `[FILL-JOB] No warehouse found for company ${companyId}, creating default warehouse...`,
      );
      try {
        warehouseId = await ensureWarehouseForCompany(prisma, companyId);
        if (warehouseId) {
          console.log(`[FILL-JOB] Default warehouse ensured: ${warehouseId}`);
        }
      } catch (error) {
        console.error(`[FILL-JOB] Error creating default warehouse:`, error);
        warehouseId = null;
      }
    } else {
      warehouseId = warehouses[0].id;
    }
  }

  const metadata: ProductionUnitMetadata = {
    productionUnitId,
    productionUnitName,
    companyId,
    companyName,
    warehouseId,
  };
  cache.set(productionUnitId, metadata);
  return metadata;
}

async function findOrCreateProduct(
  prisma: PrismaClient,
  params: {
    readonly name: string;
    readonly registrationNumber: string;
    readonly companyId: string | null;
    readonly warehouseId: string | null;
  },
  cache: Map<string, ProductSummary>,
  warnings: string[],
): Promise<ProductSummary | null> {
  const parsed = parseProductName(params.name);
  const officialName = resolveOfficialName(parsed.baseName);
  const normalizedName = normalizeName(officialName);
  const normalizedRegistrationNumber = normalizeRegistrationNumber(params.registrationNumber);
  const cacheKey = `${params.companyId ?? 'GLOBAL'}|${normalizedRegistrationNumber || 'NO-REG'}|${normalizedName || 'NO-NAME'}`;
  const cached = cache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const companyFilter: Prisma.ProductWhereInput = params.companyId
    ? { warehouse: { companyId: params.companyId } }
    : {};

  const productSelect = {
    id: true,
    name: true,
    sku: true,
    registrationNumber: true,
    category: true,
  } satisfies Prisma.ProductSelect;

  const registrationCandidates = new Set<string>();
  if (normalizedRegistrationNumber) {
    registrationCandidates.add(normalizedRegistrationNumber);
  }
  if (params.registrationNumber && params.registrationNumber !== normalizedRegistrationNumber) {
    registrationCandidates.add(params.registrationNumber);
  }

  let product: Prisma.ProductGetPayload<{ select: typeof productSelect }> | null = null;

  const rawRegistrationComparable = params.registrationNumber?.trim().toLowerCase() ?? '';
  const doesRegistrationMatch = (value: string | null | undefined): boolean => {
    if (normalizedRegistrationNumber) {
      return normalizeRegistrationNumber(value ?? '') === normalizedRegistrationNumber;
    }
    if (!rawRegistrationComparable) {
      return false;
    }
    return (
      String(value ?? '')
        .trim()
        .toLowerCase() === rawRegistrationComparable
    );
  };
  const isNameCompatible = (value: string | null | undefined): boolean => {
    if (!normalizedName) {
      return true;
    }
    const normalizedCandidateName = normalizeName(value ?? '');
    if (!normalizedCandidateName) {
      return false;
    }
    return (
      normalizedCandidateName === normalizedName ||
      normalizedCandidateName.includes(normalizedName) ||
      normalizedName.includes(normalizedCandidateName)
    );
  };

  if (registrationCandidates.size > 0) {
    const candidates = await prisma.product.findMany({
      where: {
        ...companyFilter,
        OR: Array.from(registrationCandidates).map((value) => ({ registrationNumber: value })),
      },
      select: productSelect,
    });
    product =
      candidates.find(
        (candidate) =>
          doesRegistrationMatch(candidate.registrationNumber) && isNameCompatible(candidate.name),
      ) ?? null;
  }

  if (!product && normalizedRegistrationNumber) {
    const partialName = params.name.trim();
    const nameFilteredCandidates = await prisma.product.findMany({
      where: {
        ...companyFilter,
        ...(partialName
          ? {
              name: {
                contains: partialName,
                mode: 'insensitive',
              },
            }
          : {}),
        registrationNumber: { not: null },
      },
      select: productSelect,
    });
    product =
      nameFilteredCandidates.find(
        (candidate) =>
          doesRegistrationMatch(candidate.registrationNumber) && isNameCompatible(candidate.name),
      ) ?? null;
  }

  if (!product && normalizedName) {
    product = await prisma.product.findFirst({
      where: {
        ...companyFilter,
        OR: [
          { name: { equals: officialName, mode: 'insensitive' } },
          { name: { equals: parsed.baseName, mode: 'insensitive' } },
          { name: { equals: params.name, mode: 'insensitive' } },
        ],
      },
      select: productSelect,
    });
  }

  if (!product && params.warehouseId) {
    const logRegistrationNumber =
      normalizedRegistrationNumber || params.registrationNumber || 'N/A';
    console.log(
      `[FILL-JOB] Product not found, creating: ${officialName} (reg: ${logRegistrationNumber})`,
    );

    const productRepository = new PrismaProductRepository(prisma);
    const stockRepository = new PrismaStockRepository(prisma);
    const createProductUseCase = new CreateProductUseCase(productRepository, stockRepository);

    try {
      const newProduct = await createProductUseCase.execute({
        warehouseId: params.warehouseId,
        name: officialName,
        sku: `SKU-${normalizedRegistrationNumber || params.registrationNumber || Date.now()}`,
        category: ProductCategory.PESTICIDE, // Default to PESTICIDE for fitosanitari
        type: 'Fitosanitario',
        registrationNumber: normalizedRegistrationNumber || params.registrationNumber || null,
        stock: null,
      });

      console.log(
        `[FILL-JOB] Product created: ${newProduct.product.name} (ID: ${newProduct.product.id})`,
      );

      product = {
        id: newProduct.product.id,
        name: newProduct.product.name,
        sku: newProduct.product.sku,
        registrationNumber: newProduct.product.registrationNumber,
        category: newProduct.product.category,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error creating product';
      console.error(`[FILL-JOB] Error creating product ${params.name}:`, errorMsg);
      warnings.push(`Failed to create product ${params.name}: ${errorMsg}`);
      return null;
    }
  } else if (!product) {
    warnings.push(
      `Cannot create product ${params.name}: no warehouse available for company ${params.companyId}`,
    );
    return null;
  }

  const summary: ProductSummary = {
    id: product.id,
    name: product.name,
    sku: product.sku,
    registrationNumber: product.registrationNumber ?? null,
    category: product.category,
  };
  cache.set(cacheKey, summary);
  return summary;
}

async function createIncomingStockMovement(
  stockRepository: PrismaStockRepository,
  params: {
    readonly productId: string;
    readonly quantity: number;
    readonly unitOfMeasure: string;
    readonly productName?: string;
    readonly notes?: string | null;
    readonly packagingInfo?: string | null;
  },
): Promise<Stock> {
  if (params.quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }
  let quantity = params.quantity;
  let unit = params.unitOfMeasure;
  let stockPackagingInfo = params.packagingInfo ?? null;
  if (params.productName && isPiecesUnit(unit)) {
    const conversion = convertPiecesToRealUnit(quantity, unit, params.productName);
    if (conversion.converted) {
      quantity = conversion.quantity;
      unit = conversion.unitOfMeasure;
      stockPackagingInfo = conversion.packagingInfo;
    }
  }
  const stockEntity = Stock.create({
    productId: params.productId,
    quantity,
    unitOfMeasureQuantity: unit,
    price: 0,
    unitOfMeasurePrice: DEFAULT_PRICE_UNIT,
    type: STOCK_IN_TYPE,
    notes: params.notes ?? null,
    packagingInfo: stockPackagingInfo,
  });
  const created = await stockRepository.create(stockEntity);
  return created;
}

function aggregateRequestedProducts(products: ReadonlyArray<RequestedProduct>): Array<{
  name: string;
  registrationNumber: string;
  rawRegistrationNumber: string;
  quantity: number;
  unit: string;
}> {
  const map = new Map<
    string,
    {
      name: string;
      registrationNumber: string;
      rawRegistrationNumber: string;
      quantity: number;
      unit: string;
    }
  >();
  for (const product of products ?? []) {
    if (!product) {
      continue;
    }
    const name = String(
      (product as { productName?: string; name?: string }).productName ??
        (product as { name?: string }).name ??
        '',
    ).trim();
    const rawRegNumber = String(
      (product as { registrationNumber?: string; regNumber?: string }).registrationNumber ??
        (product as { regNumber?: string }).regNumber ??
        '',
    ).trim();
    const normalizedRegNumber = normalizeRegistrationNumber(rawRegNumber);
    const incoming = extractIncomingStock(product);
    if (!name || !normalizedRegNumber || !incoming) {
      continue;
    }
    const key = `${name.toLowerCase()}|${normalizedRegNumber}|${incoming.unitOfMeasure.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.quantity = roundQuantity(existing.quantity + incoming.quantity);
    } else {
      map.set(key, {
        name,
        registrationNumber: normalizedRegNumber,
        rawRegistrationNumber: rawRegNumber,
        quantity: incoming.quantity,
        unit: incoming.unitOfMeasure,
      });
    }
  }
  return Array.from(map.values()).filter((item) => item.quantity > 0);
}

async function ensureWarehouseStockForRequestedProducts(params: {
  readonly requestedProducts?: ReadonlyArray<RequestedProduct>;
  readonly units: ReadonlyArray<UnitAllowedProductsWithDosageOutput>;
  readonly productionUnitCache: Map<string, ProductionUnitMetadata>;
  readonly productCache: Map<string, ProductSummary>;
  readonly stockRepository: PrismaStockRepository;
  readonly warnings: string[];
}): Promise<void> {
  if (!params.requestedProducts || params.requestedProducts.length === 0) {
    return;
  }
  const firstUnitId = params.units.find(
    (unit) => typeof unit.unitProductionId === 'string',
  )?.unitProductionId;
  if (!firstUnitId) {
    params.warnings.push(
      'Unable to load requested products into warehouse: missing production unit metadata',
    );
    return;
  }
  const metadata = await resolveProductionUnitMetadata(
    prisma,
    firstUnitId,
    params.productionUnitCache,
  );
  if (!metadata.companyId || !metadata.warehouseId) {
    params.warnings.push(
      'Unable to load requested products into warehouse: missing company or warehouse',
    );
    return;
  }
  const grouped = aggregateRequestedProducts(params.requestedProducts);
  for (const product of grouped) {
    const matched = await findOrCreateProduct(
      prisma,
      {
        name: product.name,
        registrationNumber: product.rawRegistrationNumber || product.registrationNumber,
        companyId: metadata.companyId,
        warehouseId: metadata.warehouseId,
      },
      params.productCache,
      params.warnings,
    );
    if (!matched) {
      continue;
    }
    const parsedProduct = parseProductName(product.name);
    try {
      await createIncomingStockMovement(params.stockRepository, {
        productId: matched.id,
        quantity: product.quantity,
        unitOfMeasure: product.unit,
        productName: product.name,
        notes: parsedProduct.baseName !== product.name ? product.name : null,
        packagingInfo: parsedProduct.packagingInfo,
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      params.warnings.push(`Failed to create incoming stock for ${product.name}: ${errorMsg}`);
    }
  }
}

export const fillTheJob = async (input: FillTheJobInput): Promise<FillTheJobOutput> => {
  const jobRepository = new PrismaJobRepository(prisma);
  const stockRepository = new PrismaStockRepository(prisma);
  const createJobUseCase = new CreateJobUseCase(jobRepository, stockRepository);

  const jobsByUnit = new Map<string, UnitScheduledJob[]>();
  const productionUnitCache = new Map<string, ProductionUnitMetadata>();
  const productCache = new Map<string, ProductSummary>();
  const warnings: string[] = [];

  // Initialize batch loader to prevent N+1 queries
  const batchLoader = new BatchLoaderContext(prisma);
  const unitIds = input.units.map((u) => u.unitProductionId);
  await batchLoader.initialize(unitIds);
  console.log(`[FILL-JOB] Batch loader initialized for ${unitIds.length} units`);

  await ensureWarehouseStockForRequestedProducts({
    requestedProducts: input.requestedProducts,
    units: input.units,
    productionUnitCache,
    productCache,
    stockRepository,
    warnings,
  });

  for (const unit of input.units) {
    const unitJobs: UnitScheduledJob[] = [];
    // Use batch loader for metadata (prevents N+1 queries)
    let metadata = batchLoader.getUnitMetadata(unit.unitProductionId);
    if (!metadata) {
      // Fallback to individual query if not in batch (shouldn't happen normally)
      metadata = await resolveProductionUnitMetadata(
        prisma,
        unit.unitProductionId,
        productionUnitCache,
      );
    }
    // Ensure warehouse exists for company
    if (metadata.companyId && !metadata.warehouseId) {
      const warehouseId = await batchLoader.getOrCreateWarehouse(metadata.companyId);
      if (warehouseId) {
        metadata = { ...metadata, warehouseId };
      }
    }
    const areaHa = typeof unit.areaHa === 'number' ? unit.areaHa : null;
    const areaHaMetadata = typeof unit.areaHa === 'number' ? unit.areaHa : undefined;
    const hasValidAreaHa = typeof areaHa === 'number' && Number.isFinite(areaHa) && areaHa > 0;

    if (!hasValidAreaHa) {
      const warning = `Skipping job creation for unit ${unit.unitProductionId} due to missing or non-positive areaHa`;
      warnings.push(warning);
      console.warn(`[FILL-JOB] ${warning}`);
      if (input.historyManager) {
        input.historyManager.addEntry(
          unit.unitProductionId,
          'unit-areaHa',
          'Job creation skipped: missing areaHa',
          'areaHa is missing or <= 0, no scheduled jobs were created for this unit',
          DosageAgentStep.JOB_CREATION,
          DataSource.USER_INPUT,
          {
            productionUnitId: unit.unitProductionId,
            productionUnitName: metadata.productionUnitName ?? undefined,
            companyId: metadata.companyId ?? undefined,
            companyName: metadata.companyName ?? undefined,
            cropName: String((unit as { cropName?: string }).cropName ?? ''),
            variety: String((unit as { variety?: string }).variety ?? ''),
            areaHa: areaHaMetadata,
            description:
              'Cannot create treatment jobs without a valid treated surface. Provide areaHa > 0 to enable job creation.',
          },
        );
      }
      jobsByUnit.set(unit.unitProductionId, unitJobs);
      continue;
    }

    const productsWithJobs = new Set<string>();

    for (const product of unit.products ?? []) {
      const productName = String((product as { name?: string }).name ?? '').trim();
      const rawRegistrationNumber = String(
        (product as { regNumber?: string }).regNumber ?? '',
      ).trim();
      const normalizedRegistrationNumber = normalizeRegistrationNumber(rawRegistrationNumber);

      if (!Array.isArray((product as { trattamenti?: unknown }).trattamenti)) {
        console.warn(
          `[FILL-JOB] Product ${productName} (${rawRegistrationNumber}) has no trattamenti array on unit ${unit.unitProductionId} - will create zero-quantity job`,
        );
        continue;
      }

      const effectiveAreaHa = getEffectiveAreaHa({
        unitAreaHa: areaHa,
        treatedAreaHa: (product as { treatedAreaHa?: number }).treatedAreaHa,
        isLocalizedTreatment: (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment,
      });

      const incomingStock = extractIncomingStock(product);
      const matchedProduct = await findOrCreateProduct(
        prisma,
        {
          name: productName,
          registrationNumber: rawRegistrationNumber || normalizedRegistrationNumber,
          companyId: metadata.companyId,
          warehouseId: metadata.warehouseId,
        },
        productCache,
        warnings,
      );

      if (!matchedProduct) {
        continue;
      }

      if (incomingStock) {
        const parsedForStock = parseProductName(productName);
        try {
          const createdStock = await createIncomingStockMovement(stockRepository, {
            productId: matchedProduct.id,
            quantity: incomingStock.quantity,
            unitOfMeasure: incomingStock.unitOfMeasure,
            productName,
            notes: parsedForStock.baseName !== productName ? productName : null,
            packagingInfo: parsedForStock.packagingInfo,
          });

          // Traccia il caricamento stock IN
          if (input.historyManager) {
            const cropName = String((unit as { cropName?: string }).cropName ?? '');
            const variety = String((unit as { variety?: string }).variety ?? '');
            const productKey = `${productName}|${normalizedRegistrationNumber}`;

            input.historyManager.addEntry(
              unit.unitProductionId,
              productKey,
              `Stock IN: Carico magazzino ${metadata.companyName || 'azienda'}`,
              `${createdStock.quantity} ${createdStock.unitOfMeasureQuantity}`,
              DosageAgentStep.JOB_CREATION,
              DataSource.WAREHOUSE_STOCK,
              {
                productionUnitId: unit.unitProductionId,
                productionUnitName: metadata.productionUnitName ?? undefined,
                productId: matchedProduct.id,
                productName: matchedProduct.name,
                productRegistrationNumber: matchedProduct.registrationNumber ?? undefined,
                companyId: metadata.companyId ?? undefined,
                companyName: metadata.companyName ?? undefined,
                cropName,
                variety,
                areaHa: areaHaMetadata,
                stockId: createdStock.id,
                stockQuantity: createdStock.quantity,
                stockUnit: createdStock.unitOfMeasureQuantity,
                description: `Movimento di entrata per rifornimento magazzino. Tipo: ${createdStock.type}. Categoria prodotto: ${matchedProduct.category}. SKU: ${matchedProduct.sku}`,
              },
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(
            `Failed to create incoming stock for product ${productName} on unit ${unit.unitProductionId}: ${errorMsg}`,
          );
        }
      }

      const treatments = (
        product as {
          trattamenti?: ReadonlyArray<{
            readonly data_distribuzione?: string | null;
            readonly dose?: number | null;
            readonly dosaggio_um?: string | null;
            readonly isLocalizedTreatment?: boolean | null;
            readonly note?: string | null;
            readonly application?: string | null;
            readonly epoca_impiego?: string | null;
            readonly fasce_rispetto_acqua?: string | null;
            readonly fasce_rispetto_colture?: string | null;
            readonly ddt_date_is_ok?: boolean | null;
            readonly ddt_date_conformity?: string | null;
            readonly ddt_date_after_treatment?: boolean | null;
          }>;
        }
      ).trattamenti;

      if (!treatments) {
        continue;
      }

      // Estrai la label dal prodotto per costruire alertNotes
      const productLabel = extractLabelFromProduct(product);

      // Calcola il totale richiesto per tutti i trattamenti di questo prodotto
      const totalStockRequiredForProduct = treatments.reduce((acc, t) => {
        if (t && typeof t.dose === 'number') {
          return acc + roundQuantity(t.dose * effectiveAreaHa);
        }
        return acc;
      }, 0);

      // Calcola lo stock disponibile REALE per questa azienda usando la utility centralizzata
      // Stock disponibile = Stock IN - Stock OUT verificati
      // Gli stock OUT da job non verificati NON contano come consumati

      if (!metadata.companyId) {
        warnings.push(`No company found for unit ${unit.unitProductionId}, cannot calculate stock`);
        continue;
      }

      const aggregatedStock = await calculateAggregatedStock(prisma, {
        productId: matchedProduct.id,
        companyId: metadata.companyId,
      });

      const stockInTotal = aggregatedStock.stockInTotal;
      const stockOutVerifiedTotal = aggregatedStock.stockOutVerifiedTotal;
      const initialStockBalance = aggregatedStock.availableStock;
      let currentStockBalance = initialStockBalance;

      console.log(
        `[FILL-JOB] Stock ${productName} (productId=${matchedProduct.id}, companyId=${metadata.companyId}): IN=${stockInTotal}, OUT_verified=${stockOutVerifiedTotal}, available=${initialStockBalance}, required=${totalStockRequiredForProduct}, stockOut=${totalStockRequiredForProduct > initialStockBalance ? totalStockRequiredForProduct - initialStockBalance : 'null'}`,
      );

      for (const treatment of treatments) {
        if (!treatment) {
          continue;
        }
        const treatmentDate = parseDate(treatment.data_distribuzione ?? null);
        const dosePerHa = typeof treatment.dose === 'number' ? treatment.dose : null;

        if (!treatmentDate || dosePerHa === null) {
          warnings.push(
            `Skipping job creation for product ${productName} on unit ${unit.unitProductionId} due to missing date or dose`,
          );
          continue;
        }

        const quantityUnit = normalizeQuantityUnit(
          treatment.dosaggio_um ??
            (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure ??
            null,
        );
        const totalQuantity = roundQuantity(dosePerHa * effectiveAreaHa);

        const isZeroQuantity = totalQuantity <= 0;
        if (isZeroQuantity) {
          console.log(
            `[FILL-JOB] Creating zero-quantity job for product ${productName} on unit ${unit.unitProductionId} (non-compliant or zero dose)`,
          );
        }

        const stock: CreateStockProps = {
          productId: matchedProduct.id,
          quantity: isZeroQuantity ? 0 : -Math.abs(totalQuantity),
          unitOfMeasureQuantity: quantityUnit,
          price: 0,
          unitOfMeasurePrice: DEFAULT_PRICE_UNIT,
          type: STOCK_OUT_TYPE,
        };

        const treatedSurface = isZeroQuantity ? 0 : effectiveAreaHa;

        // Recupera l'history per questo prodotto e unità produttiva
        const productKey = `${productName}|${normalizedRegistrationNumber}`;
        const history = input.historyManager
          ? input.historyManager.getEntries(unit.unitProductionId, productKey)
          : [];

        // Aggiungi informazioni sulla creazione del Job con metadati completi
        if (input.historyManager && matchedProduct) {
          const cropName = String((unit as { cropName?: string }).cropName ?? '');
          const variety = String((unit as { variety?: string }).variety ?? '');

          input.historyManager.addEntry(
            unit.unitProductionId,
            productKey,
            `Job creato: ${productName} su ${metadata.productionUnitName || 'Unità ' + unit.unitProductionId.slice(0, 8)}`,
            `Trattamento programmato per ${treatmentDate.toISOString().split('T')[0]}`,
            DosageAgentStep.JOB_CREATION,
            DataSource.AUTOMATIC_CALCULATION,
            {
              productionUnitId: unit.unitProductionId,
              productionUnitName: metadata.productionUnitName ?? undefined,
              productId: matchedProduct.id,
              productName: matchedProduct.name,
              productRegistrationNumber: matchedProduct.registrationNumber ?? undefined,
              companyId: metadata.companyId ?? undefined,
              companyName: metadata.companyName ?? undefined,
              cropName,
              variety,
              areaHa: areaHaMetadata,
              stockQuantity: totalQuantity,
              stockUnit: quantityUnit,
              description: `Azienda: ${metadata.companyName || 'N/A'}. Categoria prodotto: ${matchedProduct.category}. Dose: ${dosePerHa} ${quantityUnit}/ha. Superficie: ${treatedSurface ? treatedSurface.toFixed(2) : 'N/A'} ha. ${treatment.isLocalizedTreatment ? 'Trattamento localizzato' : 'Trattamento distribuito'}. ${treatment.note || ''}`,
            },
          );
        }

        const stockInfo = `Disponibile: ${currentStockBalance.toFixed(2)} ${quantityUnit}, Richiesto: ${totalQuantity.toFixed(2)} ${quantityUnit}.`;
        const enrichedNote = [treatment.note, stockInfo].filter(Boolean).join(' ');

        // Costruisci alertNotes con dati dalla label e LLM
        // Lo stock_out è calcolato come: totalStockRequired - initialStockBalance
        // Se hai 50L in magazzino e applichi 60L totali, stock_out = 10L
        const unitCropName = String((unit as { cropName?: string }).cropName ?? '');
        const unitVariety = String((unit as { variety?: string }).variety ?? '');
        // Filter rule violations relevant to this product
        const productActiveIngredient = productLabel?.principio_attivo ?? '';
        const productRuleViolations = (input.ruleViolations ?? []).filter((v) => {
          const descLower = v.description.toLowerCase();
          const nameMatch = productName && descLower.includes(productName.toLowerCase());
          const ingredientMatch =
            productActiveIngredient && descLower.includes(productActiveIngredient.toLowerCase());
          return nameMatch || ingredientMatch;
        });
        // Lookup disciplinare info for this product's active ingredient
        const disciplinareInfo = productActiveIngredient
          ? input.disciplinareInfoMap?.get(
              buildDisciplinareInfoKey(productActiveIngredient, unitCropName),
            ) ?? null
          : null;
        const alertNotes = buildAlertNotes({
          label: productLabel,
          treatment: {
            epoca_impiego: treatment.epoca_impiego ?? null,
            fasce_rispetto_acqua: treatment.fasce_rispetto_acqua ?? null,
            fasce_rispetto_colture: treatment.fasce_rispetto_colture ?? null,
            application: treatment.application ?? null,
            ddt_date_is_ok: treatment.ddt_date_is_ok ?? null,
            ddt_date_conformity: treatment.ddt_date_conformity ?? null,
            ddt_date_after_treatment: treatment.ddt_date_after_treatment ?? null,
          },
          cropName: unitCropName,
          variety: unitVariety,
          totalStockRequired: totalStockRequiredForProduct,
          quantityUnit,
          initialStockBalance,
          treatedSurface,
          ruleViolations: productRuleViolations.length > 0 ? productRuleViolations : undefined,
          disciplinareInfo,
        });

        // Aggiorna il saldo progressivo per il prossimo trattamento (solo se quantità > 0)
        if (!isZeroQuantity) {
          currentStockBalance -= totalQuantity;
        }

        // Resolve cycleId: use provided one or determine automatically from cached data
        const resolvedCycleId = batchLoader.resolveCycleId(
          unit.unitProductionId,
          unit.cycleId,
          treatmentDate,
        );

        const productAppliedRules = productName
          ? input.appliedRulesByProduct?.get(
              buildAppliedRulesKey(unit.unitProductionId, productName),
            ) ?? null
          : null;
        const { job } = await createJobUseCase.execute({
          productionUnitId: unit.unitProductionId,
          productionCycleId: resolvedCycleId,
          jobId: input.queueJobId ?? null,
          dateOfOpeation: treatmentDate,
          category: JobCategory.TREATMENT,
          quantity: totalQuantity,
          unitOfMeasureQuantity: quantityUnit,
          treatedSurface,
          isLocalizedTreatment:
            typeof treatment.isLocalizedTreatment === 'boolean'
              ? treatment.isLocalizedTreatment
              : typeof (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment ===
                  'boolean'
                ? (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment
                : null,
          note: enrichedNote || null,
          alertNotes: alertNotesToJson(alertNotes),
          appliedRules: productAppliedRules
            ? (productAppliedRules as unknown as Prisma.JsonValue)
            : null,
          productQuantityTreated: treatedSurface,
          unitOfMeasureProductQuantityTreated: treatedSurface ? 'ha' : null,
          stocks: [stock],
          history: history.length > 0 ? historyToJson(history) : null,
          conformityChecked: true,
          machineId: input.machineId ?? null,
          userId: input.operatorId ?? null,
        });

        const jobWithRelations = await prisma.job.findUnique({
          where: { id: job.id },
          include: {
            stocks: {
              include: {
                product: true,
              },
            },
          },
        });

        // Traccia la creazione dello stock OUT
        if (input.historyManager && jobWithRelations && jobWithRelations.stocks.length > 0) {
          const createdStock = jobWithRelations.stocks[0];
          const cropName = String((unit as { cropName?: string }).cropName ?? '');
          const variety = String((unit as { variety?: string }).variety ?? '');

          input.historyManager.addEntry(
            unit.unitProductionId,
            productKey,
            `Stock OUT: Prelievo magazzino ${metadata.companyName || 'azienda'}`,
            `${Math.abs(createdStock.quantity)} ${createdStock.unitOfMeasureQuantity}`,
            DosageAgentStep.JOB_CREATION,
            DataSource.WAREHOUSE_STOCK,
            {
              productionUnitId: unit.unitProductionId,
              productionUnitName: metadata.productionUnitName ?? undefined,
              productId: matchedProduct?.id,
              productName: matchedProduct?.name,
              productRegistrationNumber: matchedProduct?.registrationNumber ?? undefined,
              companyId: metadata.companyId ?? undefined,
              companyName: metadata.companyName ?? undefined,
              cropName,
              variety,
              areaHa: areaHaMetadata,
              stockId: createdStock.id,
              stockQuantity: createdStock.quantity,
              stockUnit: createdStock.unitOfMeasureQuantity,
              description: `Movimento di uscita per job ${job.id}. Tipo: ${createdStock.type}. Prodotto: ${createdStock.product.name} (${createdStock.product.sku}). Categoria: ${createdStock.product.category}`,
            },
          );
        }

        if (jobWithRelations) {
          unitJobs.push(mapJob(jobWithRelations));
          const pKey = `${productName.toLowerCase()}|${normalizedRegistrationNumber}`;
          productsWithJobs.add(pKey);
        }
      }
    }

    // Collect products that passed all filters but generated no treatment jobs
    const droppedProducts: ExcludedProduct[] = [];
    for (const product of unit.products ?? []) {
      const name = String((product as { name?: string }).name ?? '').trim();
      const regNumber = String((product as { regNumber?: string }).regNumber ?? '').trim();
      const normalizedReg = normalizeRegistrationNumber(regNumber);
      const pKey = `${name.toLowerCase()}|${normalizedReg}`;
      if (!productsWithJobs.has(pKey) && name) {
        const productLabel = (product as { label?: unknown }).label;
        const categoria =
          productLabel && typeof productLabel === 'object' && 'categoria' in productLabel
            ? String((productLabel as { categoria?: string }).categoria ?? '')
            : null;
        const specificReason = (product as { noTreatmentReason?: string }).noTreatmentReason;
        droppedProducts.push({
          index: droppedProducts.length + 1,
          name,
          regNumber,
          exclusionReason:
            specificReason ||
            `Nessun trattamento generato per ${name}: il prodotto è compatibile con la coltura ma non sono state pianificate applicazioni`,
          category: categoria,
          product,
        });
      }
    }

    if (droppedProducts.length > 0) {
      console.log(
        `[FILL-JOB] ${droppedProducts.length} products passed filters but generated no treatments for unit ${unit.unitProductionId}`,
      );
    }

    // Merge explicitly excluded products with silently dropped products
    const originalExcluded =
      (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts || [];
    const allExcludedProducts = [...originalExcluded, ...droppedProducts];
    if (allExcludedProducts.length > 0) {
      // Deduplicate excluded products by name+regNumber (case-insensitive)
      const seenExcludedProducts = new Set<string>();
      const uniqueExcludedProducts = allExcludedProducts.filter((excluded) => {
        const key = `${excluded.name.toLowerCase()}|${normalizeRegistrationNumber(excluded.regNumber)}`;
        if (seenExcludedProducts.has(key)) {
          return false;
        }
        seenExcludedProducts.add(key);
        return true;
      });

      console.log(
        `[FILL-JOB] Creating ${uniqueExcludedProducts.length} zero-quantity jobs for excluded/dropped products in unit ${unit.unitProductionId} (deduplicated from ${allExcludedProducts.length})`,
      );

      for (const excluded of uniqueExcludedProducts) {
        const productName = excluded.name;
        const rawRegistrationNumber = excluded.regNumber;
        const normalizedRegNumber = normalizeRegistrationNumber(rawRegistrationNumber);

        // Find or create the product in DB
        const matchedProduct = await findOrCreateProduct(
          prisma,
          {
            name: productName,
            registrationNumber: rawRegistrationNumber || normalizedRegNumber,
            companyId: metadata.companyId,
            warehouseId: metadata.warehouseId,
          },
          productCache,
          warnings,
        );

        if (!matchedProduct) {
          warnings.push(
            `Cannot create zero-quantity job for excluded product ${productName}: product not found/created`,
          );
          continue;
        }

        // Build the exclusion note
        const exclusionNote = `[PRODOTTO ESCLUSO] ${excluded.exclusionReason}. Questo prodotto è stato proposto ma non selezionato per il trattamento.`;

        // Create a job with quantity 0 for tracking purposes
        const treatmentDate = new Date(); // Use current date as placeholder

        // Track in history
        if (input.historyManager) {
          const productKey = `${productName}|${normalizedRegNumber}`;
          const cropName = String((unit as { cropName?: string }).cropName ?? '');
          const variety = String((unit as { variety?: string }).variety ?? '');

          input.historyManager.addEntry(
            unit.unitProductionId,
            productKey,
            `Job quantity 0: Prodotto escluso dalla selezione`,
            excluded.exclusionReason,
            DosageAgentStep.JOB_CREATION,
            DataSource.LLM_OPENAI,
            {
              productionUnitId: unit.unitProductionId,
              productionUnitName: metadata.productionUnitName ?? undefined,
              productId: matchedProduct.id,
              productName: matchedProduct.name,
              productRegistrationNumber: matchedProduct.registrationNumber ?? undefined,
              companyId: metadata.companyId ?? undefined,
              companyName: metadata.companyName ?? undefined,
              cropName,
              variety,
              areaHa: areaHaMetadata,
              description: `Prodotto non selezionato per il trattamento. Motivazione: ${excluded.exclusionReason}. Categoria: ${excluded.category || 'N/A'}`,
            },
          );
        }

        // Resolve cycleId using cached data
        const resolvedCycleId = batchLoader.resolveCycleId(
          unit.unitProductionId,
          unit.cycleId,
          treatmentDate,
        );

        // Create the zero-quantity job
        try {
          const { job } = await createJobUseCase.execute({
            productionUnitId: unit.unitProductionId,
            productionCycleId: resolvedCycleId,
            jobId: input.queueJobId ?? null,
            dateOfOpeation: treatmentDate,
            category: JobCategory.TREATMENT,
            quantity: 0,
            unitOfMeasureQuantity: 'kg',
            treatedSurface: 0,
            isLocalizedTreatment: null,
            note: exclusionNote,
            alertNotes: excludedProductInfoToJson({
              excluded_product: true,
              exclusion_reason: excluded.exclusionReason,
              product_category: excluded.category,
            }),
            appliedRules: productName
              ? ((input.appliedRulesByProduct?.get(
                  buildAppliedRulesKey(unit.unitProductionId, productName),
                ) ?? null) as unknown as Prisma.JsonValue | null)
              : null,
            productQuantityTreated: 0,
            unitOfMeasureProductQuantityTreated: 'ha',
            stocks: [
              {
                productId: matchedProduct.id,
                quantity: 0,
                unitOfMeasureQuantity: 'kg',
                price: 0,
                unitOfMeasurePrice: DEFAULT_PRICE_UNIT,
                type: STOCK_OUT_TYPE,
              },
            ],
            history: input.historyManager
              ? historyToJson(
                  input.historyManager.getEntries(
                    unit.unitProductionId,
                    `${productName}|${normalizedRegNumber}`,
                  ),
                )
              : null,
            conformityChecked: true, // Prodotti esclusi sono già "verificati" come non applicabili
            machineId: input.machineId ?? null,
            userId: input.operatorId ?? null,
          });

          const jobWithRelations = await prisma.job.findUnique({
            where: { id: job.id },
            include: {
              stocks: {
                include: {
                  product: true,
                },
              },
            },
          });

          if (jobWithRelations) {
            unitJobs.push(mapJob(jobWithRelations));
          }

          console.log(
            `[FILL-JOB] Created zero-quantity job ${job.id} for excluded product ${productName} (${rawRegistrationNumber})`,
          );
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(
            `Failed to create zero-quantity job for excluded product ${productName}: ${errorMsg}`,
          );
          console.error(`[FILL-JOB] Error creating zero-quantity job for ${productName}:`, error);
        }
      }
    }

    jobsByUnit.set(unit.unitProductionId, unitJobs);
  }

  return {
    jobsByUnit,
    warnings,
  };
};
