import { AppError } from '../../../../domain/errors/AppError';
import { InputDosageAgent } from './index';
import { JobCategory, ProductCategory } from '@prisma/client';
import { PrismaLabelExtractionRepository } from '../../../repositories/PrismaLabelExtractionRepository';
import { GetLabelTextProvider } from '../../tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../tool/extractLabel.adapter';
import {
  BulkExtractLabelsUseCase,
  BulkExtractItemResult,
} from '../../../../application/use-cases/label/BulkExtractLabelsUseCase';
import * as path from 'path';
import { promises as fs } from 'fs';
import { prisma } from '../../../repositories/Prisma';
import { llmBatchMatchProductsToCrop } from './llmCropMatcher';
import { findCropTaxonomyContext } from './cropTaxonomyProvider';
import { cleanRegNumber } from './cleanRegNumber';
import { JobHistoryManager } from './historyCollector';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { DosageAgentContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import type { ExcludedProduct } from './types';
import { buildBdfFallbackLabel } from './bdfDosageEnricher';
import { labelNeedsBdfEnrichment, enrichLabelFromBdf } from './bdfLabelEnricher';
import type { Label } from '../../../../domain/dtos/label.dto';
import { normalizeAreaHa } from '../../../utils/area-normalization';

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

type AllowedProductResult = Omit<BulkExtractItemResult, 'record'> & {
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

type ProductDosageStrategy = NonNullable<InputDosageAgent['strategy']>;

async function saveMatchResultsToJson(
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

function normalizeTextForMatch(value: string): string {
  const raw = String(value ?? '');
  if (!raw) return '';
  const withoutDiacritics = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return withoutDiacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

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

  function buildProductKey(name: string, regNumber: string): string {
    const n = String(name || '')
      .trim()
      .toLowerCase();
    const r = cleanRegNumber(regNumber);
    return `${n}|${r}`;
  }

  const quantitiesByProductKey = new Map<
    string,
    {
      quantity: number;
      quantityUnitOfMeasure: string;
      strategy?: ProductDosageStrategy;
      loadWarehouse: boolean;
      treatedAreaHa?: number;
      isLocalizedTreatment?: boolean;
      targetStock?: number;
    }
  >();
  function parseLocalizedNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value !== 'string') return NaN;
    const raw = value.trim();
    if (!raw) return NaN;
    // EU style: 1.234,56 or 46,096
    const euMatch = /^-?[0-9]{1,3}(\.[0-9]{3})*(,[0-9]+)?$/.test(raw) || /,\d+$/.test(raw);
    if (euMatch) {
      const cleaned = raw.replace(/\./g, '').replace(/,/g, '.');
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : NaN;
    }
    // US style: 1,234.56
    const usMatch = /^-?[0-9]{1,3}(,[0-9]{3})*(\.[0-9]+)?$/.test(raw);
    if (usMatch) {
      const cleaned = raw.replace(/,/g, '');
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : NaN;
    }
    // Fallback: replace comma with dot if present
    const fallback = Number(raw.replace(/,/g, '.'));
    return Number.isFinite(fallback) ? fallback : NaN;
  }
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
    const unitId =
      String((unit as { id?: string }).id ?? '')?.trim() ||
      String((unit as { idApp?: string }).idApp ?? '')?.trim();
    const cropName =
      String((unit as { cropName?: string }).cropName ?? '')?.trim() ||
      String((unit as { coltura?: string }).coltura ?? '')?.trim() ||
      String((unit as { name?: string }).name ?? '')?.trim();
    const variety =
      String((unit as { variety?: string }).variety ?? '')?.trim() ||
      String((unit as { varieta?: string }).varieta ?? '')?.trim() ||
      String((unit as { regione?: string }).regione ?? '')?.trim();
    const areaCandidate: unknown = (unit as { areaHa?: unknown }).areaHa;
    const surfaceRaw: unknown =
      (unit as { superficie?: unknown }).superficie ??
      (unit as { sauHa?: unknown }).sauHa ??
      (unit as { gisHa?: unknown }).gisHa;
    const areaHa: number | undefined =
      normalizeAreaHa(areaCandidate) ??
      (() => {
        const parsed = parseLocalizedNumber(surfaceRaw as string);
        return Number.isFinite(parsed) ? normalizeAreaHa(parsed) ?? undefined : undefined;
      })();
    const toDate = (value: unknown): Date | undefined => {
      if (value instanceof Date) {
        return value;
      }
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) {
          return undefined;
        }
        const parsed = new Date(trimmed);
        return Number.isNaN(parsed.getTime()) ? undefined : parsed;
      }
      return undefined;
    };

    const startDate = toDate((unit as { startDate?: Date | string }).startDate);
    const floweringDate = toDate((unit as { floweringDate?: Date | string }).floweringDate);
    const harvestingDate = toDate((unit as { harvestingDate?: Date | string }).harvestingDate);
    const endDate = toDate((unit as { endDate?: Date | string }).endDate);
    const seasonYear = (unit as { seasonYear?: number }).seasonYear;
    const cycleIndex = (unit as { cycleIndex?: number }).cycleIndex;
    const cycleId = (unit as { cycleId?: string }).cycleId;

    if (!unitId) {
      console.warn(`[MATCH] Skipping unit without id`);
      continue; // skip units without id
    }

    if (!cropName && !variety) {
      console.warn(`[MATCH] Unit ${unitId} has no crop/variety - skipping`);
      outputs.push({ unitProductionId: unitId, products: [], jobs: [] });
      continue;
    }

    const allowed: Array<AllowedProductResult> = [];
    const cropTaxonomy = findCropTaxonomyContext(cropName, variety);
    console.log(
      `[MATCH] Unit ${unitId}: ${cropName}/${variety} - taxonomy: ${cropTaxonomy?.commonName || 'N/A'} (${cropTaxonomy?.family || 'N/A'})`,
    );

    // Tracciamento: Informazioni sulla coltura
    if (cropTaxonomy) {
      historyManager.addEntry(
        unitId,
        `${cropName}|${variety}`,
        'Tassonomia coltura identificata',
        `${cropTaxonomy.commonName} (${cropTaxonomy.family})`,
        DosageAgentStep.CROP_MATCHING,
        DataSource.CROP_TAXONOMY,
        {
          productionUnitId: unitId,
          cropName,
          variety,
          areaHa,
          description: `Famiglia: ${cropTaxonomy.family}, Genere: ${cropTaxonomy.genus || 'N/A'}, Specie: ${cropTaxonomy.species || 'N/A'}, Categoria agronomica: ${cropTaxonomy.agronomicCategory || 'N/A'}`,
        },
      );
    }

    const unmatchedProducts: Array<{
      res: BulkExtractItemResult;
      label: Label;
    }> = [];

    // Raccoglie i prodotti esclusi con le loro motivazioni
    const excludedFromMatching: ExcludedProduct[] = [];

    // All products with valid labels go to LLM for crop matching (no mechanical matching)
    for (const res of extraction.results) {
      if ((res.status !== 'cached' && res.status !== 'extracted') || !res.label) continue;
      unmatchedProducts.push({ res, label: res.label });
    }

    // BDF FALLBACK: For products where SIAN failed (status 'failed' or no label),
    // try to build a synthetic label from BDF data
    const failedProducts = extraction.results.filter(
      (res) => (res.status !== 'cached' && res.status !== 'extracted') || !res.label,
    );

    if (failedProducts.length > 0 && cropName) {
      console.log(
        `[MATCH-BDF] ${failedProducts.length} products failed SIAN extraction, trying BDF fallback for unit ${unitId}`,
      );

      for (const res of failedProducts) {
        try {
          const bdfResult = await buildBdfFallbackLabel(res.name, res.regNumber, cropName);
          if (bdfResult) {
            const key = buildProductKey(res.name, res.regNumber);
            const qty = quantitiesByProductKey.get(key);
            const productKey = `${res.name}|${res.regNumber}`;
            console.log(
              `[MATCH-BDF] ✓ BDF fallback matched ${res.name} (${res.regNumber}) for ${cropName} - qty: ${qty?.quantity || 'N/A'}`,
            );

            historyManager.addEntry(
              unitId,
              productKey,
              'Matching prodotto-coltura: Successo BDF fallback',
              `SIAN non disponibile. Label costruita da BDF: ${bdfResult.label.dosaggi_dettagliati.length} dosi, SA: ${bdfResult.label.principio_attivo || 'N/A'}`,
              DosageAgentStep.CROP_MATCHING,
              DataSource.LABEL_EXTRACTION,
              {
                productionUnitId: unitId,
                cropName,
                variety,
                areaHa,
                productName: res.name,
                productRegistrationNumber: res.regNumber,
                description: `BDF fallback: ${bdfResult.label.malattie?.join(', ') || 'N/A'}`,
              },
            );

            const safeRes = {
              name: res.name,
              regNumber: res.regNumber,
              status: 'extracted' as const,
              url: res.url,
              label: bdfResult.label,
              error: res.error,
            };

            const loadWarehouse = qty?.loadWarehouse ?? false;
            const strategy = qty?.strategy;
            const treatedAreaHa = qty?.treatedAreaHa;
            const isLocalizedTreatment = qty?.isLocalizedTreatment;
            const targetStock = qty?.targetStock;
            if (qty && !Number.isNaN(qty.quantity) && qty.quantityUnitOfMeasure) {
              allowed.push({
                ...safeRes,
                quantity: qty.quantity,
                quantityUnitOfMeasure: qty.quantityUnitOfMeasure,
                strategy,
                loadWarehouse,
                treatedAreaHa,
                isLocalizedTreatment,
                targetStock,
              });
            } else {
              allowed.push({
                ...(safeRes as AllowedProductResult),
                strategy,
                loadWarehouse,
                treatedAreaHa,
                isLocalizedTreatment,
                targetStock,
              });
            }
          } else {
            console.log(
              `[MATCH-BDF] ✗ BDF fallback failed for ${res.name} (${res.regNumber}) - product not authorized for ${cropName} or not in BDF`,
            );
            excludedFromMatching.push({
              index: excludedFromMatching.length + 1,
              name: res.name,
              regNumber: res.regNumber,
              exclusionReason: `Etichetta non disponibile (SIAN errore) e prodotto non trovato in BDF per ${cropName}`,
              category: null,
              product: res,
            });
          }
        } catch (err) {
          console.warn(
            `[MATCH-BDF] BDF fallback error for ${res.name}:`,
            err instanceof Error ? err.message : err,
          );
          excludedFromMatching.push({
            index: excludedFromMatching.length + 1,
            name: res.name,
            regNumber: res.regNumber,
            exclusionReason: `Etichetta non disponibile (SIAN errore) e errore BDF: ${err instanceof Error ? err.message : String(err)}`,
            category: null,
            product: res,
          });
        }
      }
    }

    // BDF ENRICHMENT: fill missing critical fields on extracted labels before LLM matching
    if (cropName) {
      for (const item of unmatchedProducts) {
        if (!labelNeedsBdfEnrichment(item.label)) continue;
        const productKey = `${item.res.name}|${item.res.regNumber}`;
        const { label: enriched, enrichedFields } = await enrichLabelFromBdf(
          item.label,
          item.res.regNumber,
          item.res.name,
          cropName,
        );
        if (enrichedFields.length > 0) {
          item.label = enriched;
          (item.res as { label: Label }).label = enriched;
          historyManager.addEntry(
            unitId,
            productKey,
            'Label arricchita da BDF',
            `Campi integrati: ${enrichedFields.join(', ')}`,
            DosageAgentStep.CROP_MATCHING,
            DataSource.LABEL_EXTRACTION,
            {
              productionUnitId: unitId,
              cropName,
              variety,
              areaHa,
              productName: item.res.name,
              productRegistrationNumber: item.res.regNumber,
              description: `BDF enrichment: ${enrichedFields.join(', ')}`,
            },
          );
        }
      }
    }

    // LLM CROP MATCHING: All products with labels are matched via LLM
    if (unmatchedProducts.length > 0) {
      console.log(
        `[MATCH-LLM] ${unmatchedProducts.length} products to evaluate via LLM for unit ${unitId} (crop: ${cropName})`,
      );

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logMatchFallback({
          jobId: context.jobId,
          userId: context.userId,
          mechanicalMatches: 0,
          unmatchedProducts: unmatchedProducts.length,
          unitName: cropName || unitId,
          cropName: cropName || '',
          variety: variety || undefined,
        });
      }

      let llmMatches: Map<
        string,
        { isCompatible: boolean; confidence: number; reason: string; matchedCrops: string[] }
      >;
      let llmCallFailed = false;

      try {
        llmMatches = await llmBatchMatchProductsToCrop(
          unmatchedProducts.map((p) => ({
            key: buildProductKey(p.res.name, p.res.regNumber),
            name: p.res.name,
            label: p.label,
          })),
          cropName,
          variety,
          cropTaxonomy ?? undefined,
          context,
        );
      } catch (error) {
        // LLM call completely failed - mark all unmatched products as excluded with a clear reason
        console.error(
          `[MATCH-FALLBACK] LLM batch matching failed for unit ${unitId}:`,
          error instanceof Error ? error.message : String(error),
        );
        llmCallFailed = true;
        llmMatches = new Map();

        // Add all unmatched products to excluded list with LLM failure reason
        for (const { res, label } of unmatchedProducts) {
          excludedFromMatching.push({
            index: excludedFromMatching.length + 1,
            name: res.name,
            regNumber: res.regNumber,
            exclusionReason: `Verifica compatibilità non disponibile (servizio AI temporaneamente non raggiungibile). Il prodotto non è stato matchato meccanicamente con la coltura ${cropName}.`,
            category: label.categoria || null,
            product: res,
          });

          // Track in history
          historyManager.addEntry(
            unitId,
            `${res.name}|${res.regNumber}`,
            'Matching prodotto-coltura: LLM non disponibile',
            'Servizio AI non raggiungibile, prodotto escluso per precauzione',
            DosageAgentStep.LLM_FALLBACK_MATCHING,
            DataSource.LLM_OPENAI,
            {
              productionUnitId: unitId,
              cropName,
              variety,
              areaHa,
              productName: res.name,
              productRegistrationNumber: res.regNumber,
              description:
                'Errore nella chiamata LLM. Il prodotto non è stato selezionato per precauzione.',
            },
          );
        }
      }

      if (!llmCallFailed) {
        for (const { res, label } of unmatchedProducts) {
          const llmResult = llmMatches.get(buildProductKey(res.name, res.regNumber));
          const productKey = `${res.name}|${res.regNumber}`;
          if (llmResult && llmResult.isCompatible && llmResult.confidence >= 70) {
            console.log(
              `[MATCH-LLM] ✓ LLM matched ${res.name} (${res.regNumber}) with confidence ${llmResult.confidence}%: ${llmResult.reason}`,
            );

            // Tracciamento: Matching LLM riuscito
            const llmLabelDescription = label.dosaggi_dettagliati
              ? `Colture etichetta: ${label.colture_target?.join(', ') || 'N/A'}. Principio attivo: ${label.principio_attivo || 'N/A'}. Categoria: ${label.categoria || 'N/A'}.`
              : undefined;

            historyManager.addEntry(
              unitId,
              productKey,
              'Matching prodotto-coltura: Successo LLM',
              `Compatibilità verificata con confidence ${llmResult.confidence}%`,
              DosageAgentStep.LLM_FALLBACK_MATCHING,
              DataSource.LLM_OPENAI,
              {
                productionUnitId: unitId,
                cropName,
                variety,
                areaHa,
                productName: res.name,
                productRegistrationNumber: res.regNumber,
                description: `${llmResult.reason}. ${llmLabelDescription || ''}`,
              },
            );

            const key = buildProductKey(res.name, res.regNumber);
            const qty = quantitiesByProductKey.get(key);

            if (qty && !Number.isNaN(qty.quantity) && qty.quantityUnitOfMeasure) {
              historyManager.addEntry(
                unitId,
                productKey,
                'Quantità prodotto disponibile in magazzino',
                `${qty.quantity} ${qty.quantityUnitOfMeasure}`,
                DosageAgentStep.LLM_FALLBACK_MATCHING,
                DataSource.USER_INPUT,
                {
                  productionUnitId: unitId,
                  cropName,
                  variety,
                  productName: res.name,
                  productRegistrationNumber: res.regNumber,
                  stockQuantity: qty.quantity,
                  stockUnit: qty.quantityUnitOfMeasure,
                },
              );
            }

            // Filter dosaggi_dettagliati using LLM matchedCrops for precision
            const matchedCropSet = new Set(
              (llmResult.matchedCrops ?? []).map((c) => normalizeTextForMatch(c)),
            );
            const filteredDosaggi =
              matchedCropSet.size > 0 && Array.isArray(label.dosaggi_dettagliati)
                ? label.dosaggi_dettagliati.filter((d) => {
                    const coltura = normalizeTextForMatch(String(d.coltura ?? ''));
                    if (!coltura) return false;
                    // Check if any matchedCrop is a substring of coltura or vice versa
                    return Array.from(matchedCropSet).some(
                      (mc) => coltura.includes(mc) || mc.includes(coltura),
                    );
                  })
                : label.dosaggi_dettagliati ?? [];
            if (filteredDosaggi.length === 0 && (label.dosaggi_dettagliati?.length ?? 0) > 0) {
              console.warn(
                `[MATCH-LLM] matchedCrops filtering returned 0 dosaggi for ${res.name}, ` +
                  `keeping all ${label.dosaggi_dettagliati!.length} original dosaggi. ` +
                  `matchedCrops: ${JSON.stringify(llmResult.matchedCrops)}`,
              );
            }
            const filteredLabel = {
              ...label,
              dosaggi_dettagliati:
                filteredDosaggi.length > 0 ? filteredDosaggi : label.dosaggi_dettagliati ?? [],
            };
            const safeRes: Omit<BulkExtractItemResult, 'record'> = {
              name: res.name,
              regNumber: res.regNumber,
              status: res.status,
              url: res.url,
              label: filteredLabel,
              error: res.error,
            };

            const loadWarehouse = qty?.loadWarehouse ?? false;
            const strategy = qty?.strategy;
            const treatedAreaHa = qty?.treatedAreaHa;
            const isLocalizedTreatment = qty?.isLocalizedTreatment;
            const targetStock = qty?.targetStock;
            if (qty && !Number.isNaN(qty.quantity) && qty.quantityUnitOfMeasure) {
              allowed.push({
                ...safeRes,
                quantity: qty.quantity,
                quantityUnitOfMeasure: qty.quantityUnitOfMeasure,
                strategy,
                loadWarehouse,
                treatedAreaHa,
                isLocalizedTreatment,
                targetStock,
              });
            } else {
              allowed.push({
                ...(safeRes as AllowedProductResult),
                strategy,
                loadWarehouse,
                treatedAreaHa,
                isLocalizedTreatment,
                targetStock,
              });
            }
          } else if (llmResult) {
            console.log(
              `[MATCH-LLM] ✗ LLM rejected ${res.name} (confidence ${llmResult.confidence}%): ${llmResult.reason}`,
            );

            // Tracciamento: Prodotto rifiutato dall'LLM
            historyManager.addEntry(
              unitId,
              productKey,
              'Matching prodotto-coltura: Rifiutato da LLM',
              `Non compatibile (confidence: ${llmResult.confidence}%)`,
              DosageAgentStep.LLM_FALLBACK_MATCHING,
              DataSource.LLM_OPENAI,
              {
                productionUnitId: unitId,
                cropName,
                variety,
                areaHa,
                productName: res.name,
                productRegistrationNumber: res.regNumber,
                description: llmResult.reason,
              },
            );

            // Aggiungi ai prodotti esclusi con motivazione
            excludedFromMatching.push({
              index: excludedFromMatching.length + 1,
              name: res.name,
              regNumber: res.regNumber,
              exclusionReason: `Non compatibile con ${cropName}: ${llmResult.reason}`,
              category: label.categoria || null,
              product: res,
            });
          } else {
            // LLM returned no result for this specific product
            console.warn(
              `[MATCH-LLM] ✗ No LLM result for ${res.name} (${res.regNumber}) - product not evaluated`,
            );

            historyManager.addEntry(
              unitId,
              productKey,
              'Matching prodotto-coltura: Nessun risultato LLM',
              'Il modello non ha prodotto un risultato per questo prodotto',
              DosageAgentStep.LLM_FALLBACK_MATCHING,
              DataSource.LLM_OPENAI,
              {
                productionUnitId: unitId,
                cropName,
                variety,
                areaHa,
                productName: res.name,
                productRegistrationNumber: res.regNumber,
                description:
                  'Nessun risultato LLM disponibile. Il prodotto non è stato selezionato per precauzione.',
              },
            );

            excludedFromMatching.push({
              index: excludedFromMatching.length + 1,
              name: res.name,
              regNumber: res.regNumber,
              exclusionReason: `Verifica compatibilità non disponibile: nessun risultato LLM per ${cropName}`,
              category: label.categoria || null,
              product: res,
            });
          }
        }

        console.log(
          `[MATCH-LLM] LLM crop matching completed: ${allowed.length} products matched for unit ${unitId}`,
        );
      } // end if (!llmCallFailed)
    }

    // Deduplica prodotti esclusi per nome+regNumber (case-insensitive)
    const seenExcluded = new Set<string>();
    const uniqueExcluded = excludedFromMatching.filter((excl) => {
      const key = `${excl.name.toLowerCase()}|${excl.regNumber.toLowerCase()}`;
      if (seenExcluded.has(key)) {
        return false;
      }
      seenExcluded.add(key);
      return true;
    });

    console.log(
      `[MATCH] Unit ${unitId} final count: ${allowed.length} products matched, ${uniqueExcluded.length} excluded`,
    );
    outputs.push({
      unitProductionId: unitId,
      cycleId,
      cropName,
      variety,
      areaHa,
      startDate,
      floweringDate,
      harvestingDate,
      endDate,
      seasonYear,
      cycleIndex,
      products: allowed,
      jobs: [],
      excludedProducts: uniqueExcluded,
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

export type { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
