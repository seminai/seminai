import { InputDosageAgent } from './index';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentContext } from './context';
import { AppError } from '../../../../domain/errors/AppError';
import { PrismaLabelExtractionRepository } from '../../../repositories/PrismaLabelExtractionRepository';
import { prisma } from '../../../repositories/Prisma';
import { GetLabelTextProvider } from '../../tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../tool/extractLabel.adapter';
import { BulkExtractLabelsUseCase } from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import { cleanRegNumber } from './cleanRegNumber';
import { ProductQuantityInfo, UnitAllowedProductsOutput, buildProductKey, parseLocalizedNumber, saveMatchResultsToJson } from './flowMatchCropTreatment.part-01-unit-job-stock-product-summary';
import { matchProductionUnit } from './flowMatchCropTreatment.part-05-match-production-unit';

export const flowMatchCropTreatment = async (
  input: InputDosageAgent,
  historyManager: JobHistoryManager,
  context?: DosageAgentContext,
): Promise<ReadonlyArray<UnitAllowedProductsOutput>> => {
  const items = Array.isArray(input.products) ? input.products : [];
  if (items.length === 0) {
    throw AppError.badRequest('Body malformato: items[] richiesto', 'MISSING_ITEMS');
  }

  const repo = new PrismaLabelExtractionRepository(prisma);
  const textProvider = new GetLabelTextProvider();
  const extractor = new ExtractLabelAdapter();
  const useCase = new BulkExtractLabelsUseCase(repo, textProvider, extractor);

  const normalizedItems = items
    .map((it) => {
      const name: string =
        String((it as { productName?: string }).productName ?? '')?.trim() ||
        String((it as { name?: string }).name ?? '')?.trim();
      const rawReg: string =
        String((it as { registrationNumber?: string }).registrationNumber ?? '')?.trim() ||
        String((it as { regNumber?: string }).regNumber ?? '')?.trim();
      const regNumber = cleanRegNumber(rawReg);
      return { name, regNumber };
    })
    .filter((x) => x.name.length > 0 && x.regNumber.length > 0 && x.regNumber !== '0');

  if (normalizedItems.length === 0) {
    throw AppError.badRequest(
      'Body malformato: products richiede name e regNumber',
      'MISSING_PRODUCT_DATA',
    );
  }

  const extraction = await useCase.execute({ items: normalizedItems, context });

  const quantitiesByProductKey = new Map<string, ProductQuantityInfo>();
  for (const it of items) {
    const name: string =
      String((it as { productName?: string }).productName ?? '').trim() ||
      String((it as { name?: string }).name ?? '').trim();
    const reg: string =
      String((it as { registrationNumber?: string }).registrationNumber ?? '').trim() ||
      String((it as { regNumber?: string }).regNumber ?? '').trim();
    const key = buildProductKey(name, cleanRegNumber(reg));
    const quantity = parseLocalizedNumber((it as { quantity?: number | string }).quantity ?? NaN);
    const quantityUnitOfMeasure = String(
      (it as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure ||
        (it as { unit?: string }).unit ||
        (it as { unitOfMeasure?: string }).unitOfMeasure ||
        '',
    ).trim();
    const strategyRaw = (it as { strategy?: unknown }).strategy;
    const strategy =
      strategyRaw === 'min' ||
      strategyRaw === 'max' ||
      strategyRaw === 'avg' ||
      strategyRaw === 'current'
        ? strategyRaw
        : undefined;
    const loadWarehouse =
      typeof (it as { loadWarehouse?: boolean }).loadWarehouse === 'boolean'
        ? Boolean((it as { loadWarehouse?: boolean }).loadWarehouse)
        : false;
    const rawTreatedAreaHa = (it as { treatedAreaHa?: number }).treatedAreaHa;
    const treatedAreaHa =
      typeof rawTreatedAreaHa === 'number' &&
      Number.isFinite(rawTreatedAreaHa) &&
      rawTreatedAreaHa > 0
        ? rawTreatedAreaHa
        : undefined;
    const isLocalizedTreatment =
      typeof (it as { isLocalizedTreatment?: boolean }).isLocalizedTreatment === 'boolean'
        ? (it as { isLocalizedTreatment?: boolean }).isLocalizedTreatment
        : undefined;
    const rawTargetStock = (it as { targetStock?: number }).targetStock;
    const targetStock =
      typeof rawTargetStock === 'number' && Number.isFinite(rawTargetStock) && rawTargetStock > 0
        ? rawTargetStock
        : undefined;
    if (!Number.isNaN(quantity) && quantityUnitOfMeasure) {
      quantitiesByProductKey.set(key, {
        quantity,
        quantityUnitOfMeasure,
        strategy,
        loadWarehouse,
        treatedAreaHa,
        isLocalizedTreatment,
        targetStock,
      });
    } else if (!quantitiesByProductKey.has(key)) {
      quantitiesByProductKey.set(key, {
        quantity: NaN,
        quantityUnitOfMeasure: '',
        strategy,
        loadWarehouse,
        treatedAreaHa,
        isLocalizedTreatment,
        targetStock,
      });
    }
  }

  const units = Array.isArray(input.unitOfProduction)
    ? input.unitOfProduction
    : Array.isArray((input as unknown as { productionUnits?: unknown[] }).productionUnits)
      ? ((input as unknown as { productionUnits?: unknown[] }).productionUnits as unknown[])
      : [];
  const outputs: Array<UnitAllowedProductsOutput> = [];
  for (const unit of units) {
    await matchProductionUnit({
      unit,
      extractionResults: extraction.results,
      quantitiesByProductKey,
      historyManager,
      context,
      outputs,
    });
  }

  try {
    await saveMatchResultsToJson(outputs);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    console.warn(`[MATCH] Failed to write match-1 log: ${errMsg}`);
  }
  return outputs;
};
