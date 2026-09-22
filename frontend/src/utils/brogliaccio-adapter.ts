import type { ExtractBrogliacciResponse, BrogliaccioJobPayload } from '@/types/brogliaccio';
import type { ManualPlanRow, PlanningProduct } from '@/types/planning';

export interface ProductionUnitMatchOption {
  readonly id: string;
  readonly name: string;
}

interface BrogliaccioAdapterOptions {
  readonly idPrefix?: string;
  readonly productionUnitOptions?: readonly ProductionUnitMatchOption[];
}

export interface BrogliaccioImportSummary {
  readonly extractedFiles: number;
  readonly failedFiles: number;
  readonly rowCount: number;
  readonly failedFileNames: readonly string[];
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeUnit(value: string): string {
  return value.trim().toUpperCase();
}

function toDateInputValue(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function resolveProductionUnitId(
  productionUnitName: string | null,
  options: readonly ProductionUnitMatchOption[] = [],
): string | undefined {
  if (!productionUnitName) return undefined;
  const normalizedName = normalizeText(productionUnitName);
  return options.find((option) => normalizeText(option.name) === normalizedName)?.id;
}

function getExtractedPayloads(response: ExtractBrogliacciResponse): readonly BrogliaccioJobPayload[] {
  return response.data.results
    .filter((result) => result.status === 'extracted')
    .flatMap((result) => result.payload);
}

export function mapBrogliaccioToManualRows(
  response: ExtractBrogliacciResponse,
  options: BrogliaccioAdapterOptions = {},
): readonly ManualPlanRow[] {
  const idPrefix = options.idPrefix ?? 'brogliaccio';
  return getExtractedPayloads(response).flatMap((payload, payloadIndex) =>
    payload.stocks.map((stock, stockIndex): ManualPlanRow => ({
      id: `${idPrefix}-manual-${payloadIndex}-${stockIndex}`,
      productName: stock.product.name,
      registrationNumber: stock.product.registrationNumber ?? '',
      quantity: Math.abs(stock.quantity),
      quantityUnitOfMeasure: normalizeUnit(stock.unitOfMeasureQuantity),
      date: toDateInputValue(payload.dateOfOpeation),
      productionUnitId: resolveProductionUnitId(
        payload.productionUnitName,
        options.productionUnitOptions,
      ),
      category: payload.category,
    })),
  );
}

export function mapBrogliaccioToPlanningProducts(
  response: ExtractBrogliacciResponse,
): readonly PlanningProduct[] {
  return getExtractedPayloads(response).flatMap((payload) =>
    payload.stocks.map((stock): PlanningProduct => ({
      productName: stock.product.name,
      registrationNumber: stock.product.registrationNumber ?? '',
      quantity: Math.abs(stock.quantity),
      quantityUnitOfMeasure: normalizeUnit(stock.unitOfMeasureQuantity),
      treatedAreaHa: payload.treatedSurface ?? undefined,
    })),
  );
}

export function summarizeBrogliaccioImport(
  response: ExtractBrogliacciResponse,
  rowCount: number,
): BrogliaccioImportSummary {
  const failedResults = response.data.results.filter((result) => result.status === 'failed');
  const extractedFiles = response.data.results.filter((result) => result.status === 'extracted').length;
  return {
    extractedFiles,
    failedFiles: failedResults.length,
    rowCount,
    failedFileNames: failedResults.map((result) => result.fileName),
  };
}
