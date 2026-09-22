import type { IProductionUnitRepository } from '../../domain/repositories/IProductionUnitRepository';
import type { IProductRepository } from '../../domain/repositories/IProductRepository';
import type { ILabelExtractionRepository } from '../../domain/repositories/ILabelExtractionRepository';
import type { ILabelExtractor, ILabelTextProvider } from '../../domain/repositories/ILabelServices';
import type { BulkCreateJobItemDTO } from '../use-cases/job/BulkCreateProductAndJobUseCase';
import {
  type DosageAgentContext,
  hasContext,
} from '../../infrastructure/services/agents/dosage_agent/context';
import { DosageLoggerService } from '../../infrastructure/services/dosage-logger.service';
import { ProductLabelResolver } from './ProductLabelResolver';
import { matchProductsToProductionUnits } from './match-products-to-production-units';
import { buildCropGroups, groupByProductionUnit } from './production-unit-matcher.helpers';
import type { ResolveItemsResult, UnmatchedProductWarning } from './production-unit-matcher.types';

export type { ResolveItemsResult, UnmatchedProductWarning } from './production-unit-matcher.types';

export class ProductionUnitMatcherService {
  private context?: DosageAgentContext;
  private onProgress?: (progress: number) => Promise<void>;
  private readonly productLabelResolver: ProductLabelResolver;

  constructor(
    private readonly productionUnitRepository: IProductionUnitRepository,
    productRepository: IProductRepository,
    labelExtractionRepository: ILabelExtractionRepository,
    labelTextProvider: ILabelTextProvider,
    labelExtractor: ILabelExtractor,
  ) {
    this.productLabelResolver = new ProductLabelResolver(
      productRepository,
      labelExtractionRepository,
      labelTextProvider,
      labelExtractor,
    );
  }

  async resolveItems(
    items: BulkCreateJobItemDTO[],
    userId: string,
    context?: DosageAgentContext,
    onProgress?: (progress: number) => Promise<void>,
  ): Promise<ResolveItemsResult> {
    this.context = context;
    this.onProgress = onProgress;
    const resolvedItems: BulkCreateJobItemDTO[] = [];
    const warnings: UnmatchedProductWarning[] = [];
    const withProductionUnit = items.filter((item) => Boolean(item.productionUnitId));
    const withoutProductionUnit = items.filter((item) => !item.productionUnitId);
    resolvedItems.push(...withProductionUnit);
    if (withoutProductionUnit.length === 0) return { resolvedItems, warnings };

    const userProductionUnits = await this.productionUnitRepository.findManyByUserId(userId);
    if (userProductionUnits.length === 0) {
      warnings.push(...this.buildMissingProductionUnitWarnings(withoutProductionUnit));
      return { resolvedItems, warnings };
    }
    this.logProgress(`Caricamento unità produttive: ${userProductionUnits.length} trovate`, 8);
    const cropGroups = buildCropGroups(userProductionUnits);

    for (const item of withoutProductionUnit) {
      if (!item.stocks || item.stocks.length === 0) {
        warnings.push({
          productName: 'N/A',
          registrationNumber: 'N/A',
          reason: 'Nessun prodotto da matchare con le unità produttive',
        });
        continue;
      }
      const products = await this.productLabelResolver.resolveIdentities(item.stocks);
      this.logProgress(`Risoluzione identità prodotti: ${products.length} prodotti`, 10);
      await this.productLabelResolver.enrichRegistrationNumbers(products);
      this.logProgress(
        `Ricerca numeri registrazione completata: ${products.filter((product) => product.registrationNumber).length}/${products.length} trovati`,
        20,
      );
      await this.productLabelResolver.loadLabels(products, this.context);
      this.logProgress(
        `Etichette caricate: ${products.filter((product) => product.label).length}/${products.length} disponibili`,
        40,
      );
      this.logProgress(
        `Matching colture via LLM: ${products.length} prodotti vs ${cropGroups.size} colture`,
        42,
      );
      const matchResults = await matchProductsToProductionUnits(products, cropGroups, this.context);
      this.logProgress(
        `Matching completato: ${[...matchResults.values()].filter(Boolean).length}/${products.length} abbinati`,
        55,
      );
      const grouped = groupByProductionUnit({
        originalItem: item,
        products,
        matchResults,
      });
      resolvedItems.push(...grouped.expanded);
      warnings.push(...grouped.warnings);
    }

    this.logProgress(
      `Risoluzione completata: ${resolvedItems.length - withProductionUnit.length} elementi da ${withoutProductionUnit.length} trattamenti. Warnings: ${warnings.length}`,
      58,
    );
    return { resolvedItems, warnings };
  }

  private logProgress(
    message: string,
    progress?: number,
    metadata?: Record<string, unknown>,
  ): void {
    console.log(`[PU-MATCHER] ${message}`);
    if (!hasContext(this.context)) return;
    const logger = DosageLoggerService.getInstance();
    logger.logInfo({
      jobId: this.context.jobId,
      userId: this.context.userId,
      message,
      metadata,
    });
    if (progress === undefined) return;
    logger.logProgress({
      jobId: this.context.jobId,
      userId: this.context.userId,
      progress,
      phase: 'Risoluzione unità produttive',
    });
    void this.onProgress?.(progress);
  }

  private buildMissingProductionUnitWarnings(
    items: readonly BulkCreateJobItemDTO[],
  ): UnmatchedProductWarning[] {
    return items.flatMap((item) =>
      (item.stocks ?? []).map((stock) => ({
        productName: stock.product?.name || stock.productId || 'Sconosciuto',
        registrationNumber: stock.product?.registrationNumber || '',
        reason: 'Nessuna unità produttiva disponibile per questo utente',
      })),
    );
  }
}
