import { JobCategory, ProductCategory } from '@prisma/client';
import type { ExcludedProduct } from './types';
import { BulkExtractItemResult } from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { InputDosageAgent } from './index';
import * as path from 'path';
import { promises as fs } from 'fs';
import { cleanRegNumber } from './cleanRegNumber';
import type { Label } from '../../../../domain/dtos/label.dto';
import { findCropTaxonomyContext } from './cropTaxonomyProvider';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';

export interface UnitJobStockProductSummary {
  readonly id: string;
  readonly name: string;
  readonly sku: string;
  readonly registrationNumber: string | null;
  readonly category: ProductCategory;
}

export interface UnitJobStockSummary {
  readonly id: string;
  readonly productId: string;
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly price: number;
  readonly unitOfMeasurePrice: string;
  readonly type: string;
  readonly product: UnitJobStockProductSummary;
}

export interface UnitScheduledJob {
  readonly id: string;
  readonly jobId: string | null;
  readonly productionUnitId: string;
  readonly dateOfOpeation: Date;
  readonly isVerified: boolean;
  readonly category: JobCategory;
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly productQuantityTreated: number | null;
  readonly unitOfMeasureProductQuantityTreated: string | null;
  readonly modeOfApplication: string | null;
  readonly avversity: string | null;
  readonly giustification: string | null;
  readonly treatedSurface: number | null;
  readonly isLocalizedTreatment: boolean | null;
  readonly userId: string | null;
  readonly note: string | null;
  readonly totalDistributedWaterL: number | null;
  readonly machineId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly stocks: ReadonlyArray<UnitJobStockSummary>;
}

export interface UnitAllowedProductsOutput {
  readonly unitProductionId: string;
  readonly cycleId?: string;
  readonly cropName?: string;
  readonly variety?: string;
  readonly areaHa?: number;
  readonly startDate?: Date;
  readonly floweringDate?: Date;
  readonly harvestingDate?: Date;
  readonly endDate?: Date;
  readonly seasonYear?: number;
  readonly cycleIndex?: number;
  readonly products: ReadonlyArray<AllowedProductResult>;
  readonly jobs: ReadonlyArray<UnitScheduledJob>;
  /** Prodotti proposti dall'utente ma non compatibili con la coltura */
  readonly excludedProducts?: ReadonlyArray<ExcludedProduct>;
}

export type AllowedProductResult = Omit<BulkExtractItemResult, 'record'> & {
  readonly quantity?: number;
  readonly quantityUnitOfMeasure?: string;
  readonly strategy?: ProductDosageStrategy;
  readonly loadWarehouse?: boolean;
  /** Superficie effettiva da trattare (in ettari), per trattamenti localizzati */
  readonly treatedAreaHa?: number;
  /** true = localizzato (usa treatedAreaHa), false/undefined = a pieno campo (usa areaHa unità) */
  readonly isLocalizedTreatment?: boolean;
  /** Giacenza da raggiungere: quantità da riservare in magazzino (stessa UoM di quantityUnitOfMeasure) */
  readonly targetStock?: number;
};

export type ProductDosageStrategy = NonNullable<InputDosageAgent['strategy']>;

export async function saveMatchResultsToJson(
  outputs: ReadonlyArray<UnitAllowedProductsOutput>,
): Promise<void> {
  const logDir = path.resolve(process.cwd(), 'extraction', 'match-1-log');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `match-1_${timestamp}.json`;
  const filepath = path.join(logDir, filename);
  const fileContent = JSON.stringify(outputs, null, 2);
  await fs.mkdir(logDir, { recursive: true });
  await fs.writeFile(filepath, fileContent, { encoding: 'utf-8' });
}

export function normalizeTextForMatch(value: string): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  const withoutDiacritics = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function buildProductKey(name: string, regNumber: string): string {
  return `${String(name || '').trim().toLowerCase()}|${cleanRegNumber(regNumber)}`;
}

export function parseLocalizedNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : Number.NaN;
  if (typeof value !== 'string' || !value.trim()) return Number.NaN;
  const raw = value.trim();
  const isEuropean = /^-?[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$/.test(raw) || /,\d+$/.test(raw);
  if (isEuropean) return Number(raw.replace(/\./g, '').replace(/,/g, '.'));
  const isAmerican = /^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$/.test(raw);
  if (isAmerican) return Number(raw.replace(/,/g, ''));
  return Number(raw.replace(/,/g, '.'));
}

export function toOptionalDate(value: unknown): Date | undefined {
  if (value instanceof Date) return value;
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const parsed = new Date(value.trim());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export interface ProductQuantityInfo {
  readonly quantity: number;
  readonly quantityUnitOfMeasure: string;
  readonly strategy?: ProductDosageStrategy;
  readonly loadWarehouse: boolean;
  readonly treatedAreaHa?: number;
  readonly isLocalizedTreatment?: boolean;
  readonly targetStock?: number;
}

export interface CropProductCandidate {
  readonly res: BulkExtractItemResult;
  label: Label;
}

export interface CropMatchStageParams {
  readonly extractionResults: ReadonlyArray<BulkExtractItemResult>;
  readonly unitId: string;
  readonly cropName: string;
  readonly variety: string;
  readonly areaHa?: number;
  readonly cropTaxonomy: ReturnType<typeof findCropTaxonomyContext>;
  readonly allowed: AllowedProductResult[];
  readonly unmatchedProducts: CropProductCandidate[];
  readonly excludedFromMatching: ExcludedProduct[];
  readonly quantitiesByProductKey: ReadonlyMap<string, ProductQuantityInfo>;
  readonly historyManager: JobHistoryManager;
  readonly context?: DosageAgentContext;
}
