import { Label } from '../../domain/dtos/label.dto';
import { ProductionUnit } from '../../domain/entities/ProductionUnit';
import { IProductionUnitRepository } from '../../domain/repositories/IProductionUnitRepository';
import { IProductRepository } from '../../domain/repositories/IProductRepository';
import {
  ILabelExtractionRepository,
  LabelExtractionRecord,
} from '../../domain/repositories/ILabelExtractionRepository';
import { ILabelTextProvider, ILabelExtractor } from '../../domain/repositories/ILabelServices';
import {
  BulkExtractLabelsUseCase,
  BulkExtractItemInput,
} from '../use-cases/label/BulkExtractLabelsUseCase';
import {
  BulkCreateJobItemDTO,
  BulkStockItemDTO,
} from '../use-cases/job/BulkCreateProductAndJobUseCase';
import { llmMatchProductToCrop } from '../../infrastructure/services/agents/dosage_agent/llmCropMatcher';
import { findCropTaxonomyContext } from '../../infrastructure/services/agents/dosage_agent/cropTaxonomyProvider';
import { mapWithLimit } from '../../infrastructure/services/agents/dosage_agent/parallelLimiter';
import { ProductRegistrationLookupService } from '../../infrastructure/services/utils/ProductRegistrationLookup';
import { llmFindBestProductInRegistry } from '../../infrastructure/services/agents/shared/llmProductRegistryMatcher';
import {
  DosageAgentContext,
  hasContext,
} from '../../infrastructure/services/agents/dosage_agent/context';
import { DosageLoggerService } from '../../infrastructure/services/dosage-logger.service';

const CONFIDENCE_THRESHOLD = 70;
const LLM_CONCURRENCY = 5;

/** A product that could not be matched to any production unit */
export interface UnmatchedProductWarning {
  productName: string;
  registrationNumber: string;
  reason: string;
}

export interface ResolveItemsResult {
  resolvedItems: BulkCreateJobItemDTO[];
  warnings: UnmatchedProductWarning[];
}

/** Internal: product identity resolved from a stock item */
interface ResolvedProduct {
  stockItem: BulkStockItemDTO;
  name: string;
  registrationNumber: string;
  label: Label | null;
  labelError?: string;
  /** True when product is not found in fts registry (likely fertilizer/adjuvant) */
  isFertilizer?: boolean;
}

/** Internal: PUs grouped by unique crop */
interface CropGroup {
  cropName: string;
  variety: string;
  taxonomy: ReturnType<typeof findCropTaxonomyContext>;
  pus: Array<{ id: string; areaHa: number }>;
}

export class ProductionUnitMatcherService {
  private context?: DosageAgentContext;
  private onProgress?: (progress: number) => Promise<void>;

  constructor(
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly productRepository: IProductRepository,
    private readonly labelExtractionRepository: ILabelExtractionRepository,
    private readonly labelTextProvider: ILabelTextProvider,
    private readonly labelExtractor: ILabelExtractor,
  ) {}

  private logProgress(
    message: string,
    progress?: number,
    metadata?: Record<string, unknown>,
  ): void {
    console.log(`[PU-MATCHER] ${message}`);
    if (hasContext(this.context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logInfo({
        jobId: this.context.jobId,
        userId: this.context.userId,
        message,
        metadata,
      });
      if (progress !== undefined) {
        logger.logProgress({
          jobId: this.context.jobId,
          userId: this.context.userId,
          progress,
          phase: 'Risoluzione unità produttive',
        });
        void this.onProgress?.(progress);
      }
    }
  }

  /**
   * Resolves items that have no productionUnitId by matching their products
   * to user production units via LLM crop matching.
   *
   * Items WITH productionUnitId pass through unchanged.
   * Items WITHOUT productionUnitId are expanded: one output item per matched PU.
   */
  async resolveItems(
    items: BulkCreateJobItemDTO[],
    userId: string,
    context?: DosageAgentContext,
    onProgress?: (progress: number) => Promise<void>,
  ): Promise<ResolveItemsResult> {
    this.context = context;
    this.onProgress = onProgress;

    const resolvedItems: BulkCreateJobItemDTO[] = [];
    const allWarnings: UnmatchedProductWarning[] = [];

    const withPU = items.filter((item) => !!item.productionUnitId);
    const withoutPU = items.filter((item) => !item.productionUnitId);

    resolvedItems.push(...withPU);

    if (withoutPU.length === 0) {
      return { resolvedItems, warnings: [] };
    }

    // Load user's production units once
    const userPUs = await this.productionUnitRepository.findManyByUserId(userId);
    if (userPUs.length === 0) {
      for (const item of withoutPU) {
        for (const s of item.stocks || []) {
          allWarnings.push({
            productName: s.product?.name || s.productId || 'Sconosciuto',
            registrationNumber: s.product?.registrationNumber || '',
            reason: 'Nessuna unità produttiva disponibile per questo utente',
          });
        }
      }
      return { resolvedItems, warnings: allWarnings };
    }

    this.logProgress(`Caricamento unità produttive: ${userPUs.length} trovate`, 8);

    // Build crop groups (deduplicate PUs by cropName+variety)
    const cropGroups = this.buildCropGroups(userPUs);

    for (const item of withoutPU) {
      if (!item.stocks || item.stocks.length === 0) {
        allWarnings.push({
          productName: 'N/A',
          registrationNumber: 'N/A',
          reason: 'Nessun prodotto da matchare con le unità produttive',
        });
        continue;
      }

      // a. Resolve product identities
      const products = await this.resolveProductIdentities(item.stocks);
      this.logProgress(`Risoluzione identità prodotti: ${products.length} prodotti`, 10);

      // a2. Enrich missing registration numbers from ministry dataset (+ LLM fallback)
      await this.enrichRegistrationNumbers(products);
      this.logProgress(
        `Ricerca numeri registrazione completata: ${products.filter((p) => p.registrationNumber).length}/${products.length} trovati`,
        20,
      );

      // b. Load labels (cache first, then extract)
      await this.loadLabels(products);
      this.logProgress(
        `Etichette caricate: ${products.filter((p) => p.label).length}/${products.length} disponibili`,
        40,
      );

      // c. Match products to PUs via LLM
      this.logProgress(
        `Matching colture via LLM: ${products.length} prodotti vs ${cropGroups.size} colture`,
        42,
      );
      const matchResults = await this.matchProductsToPUs(products, cropGroups);
      this.logProgress(
        `Matching completato: ${[...matchResults.values()].filter(Boolean).length}/${products.length} abbinati`,
        55,
      );

      // d. Group by PU and build expanded items
      const { expanded, warnings } = this.groupByPUAndBuild(item, products, matchResults);
      resolvedItems.push(...expanded);
      allWarnings.push(...warnings);
    }

    this.logProgress(
      `Risoluzione completata: ${resolvedItems.length - withPU.length} elementi da ${withoutPU.length} trattamenti. Warnings: ${allWarnings.length}`,
      58,
    );

    return { resolvedItems, warnings: allWarnings };
  }

  private buildCropGroups(
    userPUs: Array<{
      productionUnit: ProductionUnit;
      companyId: string;
      companyName: string;
      field: { id: string; name: string; sauHa: number | null; gisHa: number | null };
      areaHaOnField: number;
    }>,
  ): Map<string, CropGroup> {
    const groups = new Map<string, CropGroup>();

    for (const { productionUnit: pu } of userPUs) {
      const cropName = pu.cropName || '';
      const variety = pu.variety || '';
      const key = `${cropName.toLowerCase()}|${variety.toLowerCase()}`;

      if (!groups.has(key)) {
        groups.set(key, {
          cropName,
          variety,
          taxonomy: findCropTaxonomyContext(cropName, variety),
          pus: [],
        });
      }
      groups.get(key)!.pus.push({ id: pu.id, areaHa: pu.areaHa });
    }

    // Sort PUs within each group by areaHa descending (largest first = tiebreaker)
    for (const group of groups.values()) {
      group.pus.sort((a, b) => b.areaHa - a.areaHa);
    }

    return groups;
  }

  private async resolveProductIdentities(stocks: BulkStockItemDTO[]): Promise<ResolvedProduct[]> {
    const results: ResolvedProduct[] = [];

    for (const s of stocks) {
      if (s.product) {
        results.push({
          stockItem: s,
          name: s.product.name || '',
          registrationNumber: s.product.registrationNumber || '',
          label: null,
        });
      } else if (s.productId) {
        const existing = await this.productRepository.findById(s.productId);
        if (existing) {
          results.push({
            stockItem: s,
            name: existing.name,
            registrationNumber: existing.registrationNumber || '',
            label: null,
          });
        } else {
          results.push({
            stockItem: s,
            name: s.productId,
            registrationNumber: '',
            label: null,
            labelError: `Prodotto con id ${s.productId} non trovato`,
          });
        }
      } else {
        // Stock without product or productId - track as unresolvable
        results.push({
          stockItem: s,
          name: 'Sconosciuto',
          registrationNumber: '',
          label: null,
          labelError: 'Stock senza productId o dati prodotto',
        });
      }
    }

    return results;
  }

  private async enrichRegistrationNumbers(products: ResolvedProduct[]): Promise<void> {
    const lookupService = new ProductRegistrationLookupService();
    for (const p of products) {
      if (p.registrationNumber || !p.name || p.name === 'Sconosciuto') {
        continue;
      }

      // Step 1: Fuzzy match (existing)
      const result = lookupService.findProduct(p.name);
      if (result) {
        p.registrationNumber = result.registrationNumber;
        if (p.stockItem.product) {
          p.stockItem.product = {
            ...p.stockItem.product,
            registrationNumber: result.registrationNumber,
          };
        }
        continue;
      }

      // Step 2: LLM fallback — get top candidates from fts and let LLM pick
      const candidates = lookupService.findTopCandidates(p.name, 15);
      if (candidates.length > 0) {
        const llmResult = await llmFindBestProductInRegistry(
          p.name,
          candidates.map((c) => ({
            registrationNumber: c.registrationNumber,
            productName: c.productName,
          })),
        );
        if (llmResult) {
          console.log(
            `[PU-MATCHER] LLM fallback matched "${p.name}" → "${llmResult.productName}" (${llmResult.registrationNumber}) confidence=${llmResult.confidence}`,
          );
          p.registrationNumber = llmResult.registrationNumber;
          if (p.stockItem.product) {
            p.stockItem.product = {
              ...p.stockItem.product,
              registrationNumber: llmResult.registrationNumber,
            };
          }
          continue;
        }
      }

      // Step 3: Not found in fts at all → mark as non-pesticide (fertilizer/adjuvant)
      p.isFertilizer = true;
      console.log(
        `[PU-MATCHER] Product "${p.name}" not found in fts registry, marked as fertilizer/adjuvant`,
      );
    }
  }

  private async loadLabels(products: ResolvedProduct[]): Promise<void> {
    // Filter products that have a registrationNumber, no error, and are not fertilizers
    const toLoad = products.filter((p) => p.registrationNumber && !p.labelError && !p.isFertilizer);

    if (toLoad.length === 0) {
      // Mark all without regNumber as having a label error
      for (const p of products) {
        if (!p.registrationNumber && !p.labelError) {
          p.labelError = 'Impossibile risolvere label senza numero di registrazione';
        }
      }
      return;
    }

    // Batch lookup in cache first
    const lookupParams = toLoad.map((p) => ({
      productName: p.name,
      registrationNumber: p.registrationNumber,
    }));
    const cachedRecords =
      await this.labelExtractionRepository.findManyByProductAndRegistration(lookupParams);

    // Map cached results by regNumber for quick access
    const cachedByReg = new Map<string, LabelExtractionRecord>();
    for (const record of cachedRecords) {
      cachedByReg.set(record.registrationNumber, record);
    }

    // Assign cached labels and collect uncached
    const uncached: ResolvedProduct[] = [];
    for (const p of toLoad) {
      const cached = cachedByReg.get(p.registrationNumber);
      if (cached) {
        p.label = cached.label as Label;
      } else {
        uncached.push(p);
      }
    }

    // Extract uncached labels via BulkExtractLabelsUseCase
    if (uncached.length > 0) {
      try {
        const extractUseCase = new BulkExtractLabelsUseCase(
          this.labelExtractionRepository,
          this.labelTextProvider,
          this.labelExtractor,
        );

        const extractItems: BulkExtractItemInput[] = uncached.map((p) => ({
          name: p.name,
          regNumber: p.registrationNumber,
        }));

        const outcome = await extractUseCase.execute({
          items: extractItems,
          context: this.context,
        });

        // Map extraction results back
        const resultsByReg = new Map(outcome.results.map((r) => [r.regNumber, r]));
        for (const p of uncached) {
          const result = resultsByReg.get(p.registrationNumber);
          if (result?.label) {
            p.label = result.label;
          } else {
            p.labelError = result?.error || 'Estrazione label fallita';
          }
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        for (const p of uncached) {
          p.labelError = `Estrazione label fallita: ${errMsg}`;
        }
      }
    }

    // Mark products without regNumber (skip fertilizers — they're handled separately)
    for (const p of products) {
      if (!p.registrationNumber && !p.labelError && !p.label && !p.isFertilizer) {
        p.labelError = 'Impossibile risolvere label senza numero di registrazione';
      }
    }
  }

  private async matchProductsToPUs(
    products: ResolvedProduct[],
    cropGroups: Map<string, CropGroup>,
  ): Promise<Map<number, { puId: string; confidence: number } | null>> {
    const results = new Map<number, { puId: string; confidence: number } | null>();
    const cropEntries = Array.from(cropGroups.entries());

    // For each product, match against all unique crops in parallel
    for (let i = 0; i < products.length; i++) {
      const product = products[i];

      if (!product.label) {
        results.set(i, null);
        continue;
      }

      const matchAttempts = await mapWithLimit(
        cropEntries,
        async ([, cropGroup]) => {
          const result = await llmMatchProductToCrop(
            product.name,
            product.label!,
            cropGroup.cropName,
            cropGroup.variety || undefined,
            cropGroup.taxonomy ?? undefined,
            this.context,
          );
          // Best PU in this crop group = largest areaHa (already sorted)
          return { cropGroup, result, bestPuId: cropGroup.pus[0].id };
        },
        LLM_CONCURRENCY,
      );

      // Find best match (highest confidence above threshold)
      let bestMatch: { puId: string; confidence: number } | null = null;
      for (const attempt of matchAttempts) {
        if (
          attempt.result.isCompatible &&
          attempt.result.confidence >= CONFIDENCE_THRESHOLD &&
          (!bestMatch || attempt.result.confidence > bestMatch.confidence)
        ) {
          bestMatch = {
            puId: attempt.bestPuId,
            confidence: attempt.result.confidence,
          };
        }
      }

      results.set(i, bestMatch);
    }

    return results;
  }

  private groupByPUAndBuild(
    originalItem: BulkCreateJobItemDTO,
    products: ResolvedProduct[],
    matchResults: Map<number, { puId: string; confidence: number } | null>,
  ): { expanded: BulkCreateJobItemDTO[]; warnings: UnmatchedProductWarning[] } {
    const warnings: UnmatchedProductWarning[] = [];
    const puGroups = new Map<string, BulkStockItemDTO[]>();
    const unmatchedProducts: ResolvedProduct[] = [];

    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      const match = matchResults.get(i);

      if (!match) {
        unmatchedProducts.push(product);
        continue;
      }

      if (!puGroups.has(match.puId)) {
        puGroups.set(match.puId, []);
      }
      puGroups.get(match.puId)!.push(product.stockItem);
    }

    // Fallback: assign unmatched products to the dominant PU (the one with most stocks)
    if (unmatchedProducts.length > 0 && puGroups.size > 0) {
      const dominantPuId = [...puGroups.entries()].sort((a, b) => b[1].length - a[1].length)[0][0];

      for (const product of unmatchedProducts) {
        puGroups.get(dominantPuId)!.push(product.stockItem);

        if (product.isFertilizer) {
          warnings.push({
            productName: product.name,
            registrationNumber: '',
            reason:
              'Prodotto non fitosanitario – risoluzione etichetta attiva solo per fitofarmaci',
          });
        } else {
          warnings.push({
            productName: product.name,
            registrationNumber: product.registrationNumber,
            reason: `${product.labelError || 'Nessuna unità produttiva compatibile'} – assegnato alla stessa unità produttiva degli altri prodotti del trattamento`,
          });
        }
      }
    } else if (unmatchedProducts.length > 0) {
      // No PU matched at all — just warnings, no fallback possible
      for (const product of unmatchedProducts) {
        warnings.push({
          productName: product.name,
          registrationNumber: product.registrationNumber,
          reason: product.isFertilizer
            ? 'Prodotto non fitosanitario – risoluzione etichetta attiva solo per fitofarmaci'
            : product.labelError || 'Nessuna unità produttiva compatibile',
        });
      }
    }

    // Build one item per PU group, cloning original item's non-stock fields
    const hasFertilizer = unmatchedProducts.some((p) => p.isFertilizer);
    const fertilizerNote = hasFertilizer
      ? 'Contiene prodotti non fitosanitari: la risoluzione etichetta è attiva solo per fitofarmaci.'
      : null;

    const expanded: BulkCreateJobItemDTO[] = [];
    for (const [puId, stocks] of puGroups) {
      expanded.push({
        ...originalItem,
        productionUnitId: puId,
        stocks,
        note: [originalItem.note, fertilizerNote].filter(Boolean).join(' | ') || null,
      });
    }

    return { expanded, warnings };
  }
}
