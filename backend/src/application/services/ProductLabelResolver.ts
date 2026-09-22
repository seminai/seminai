import type { Label } from '../../domain/dtos/label.dto';
import type { IProductRepository } from '../../domain/repositories/IProductRepository';
import type {
  ILabelExtractionRepository,
  LabelExtractionRecord,
} from '../../domain/repositories/ILabelExtractionRepository';
import type { ILabelExtractor, ILabelTextProvider } from '../../domain/repositories/ILabelServices';
import {
  BulkExtractLabelsUseCase,
  type BulkExtractItemInput,
} from '../use-cases/label/BulkExtractLabelsUseCase';
import type { BulkStockItemDTO } from '../use-cases/job/BulkCreateProductAndJobUseCase';
import { llmFindBestProductInRegistry } from '../../infrastructure/services/agents/shared/llmProductRegistryMatcher';
import type { DosageAgentContext } from '../../infrastructure/services/agents/dosage_agent/context';
import { ProductRegistrationLookupService } from '../../infrastructure/services/utils/ProductRegistrationLookup';
import type { ResolvedProduct } from './production-unit-matcher.types';

export class ProductLabelResolver {
  constructor(
    private readonly productRepository: IProductRepository,
    private readonly labelExtractionRepository: ILabelExtractionRepository,
    private readonly labelTextProvider: ILabelTextProvider,
    private readonly labelExtractor: ILabelExtractor,
  ) {}

  async resolveIdentities(stocks: BulkStockItemDTO[]): Promise<ResolvedProduct[]> {
    const results: ResolvedProduct[] = [];
    for (const stock of stocks) {
      if (stock.product) {
        results.push({
          stockItem: stock,
          name: stock.product.name || '',
          registrationNumber: stock.product.registrationNumber || '',
          label: null,
        });
        continue;
      }
      if (stock.productId) {
        const existing = await this.productRepository.findById(stock.productId);
        results.push(
          existing
            ? {
                stockItem: stock,
                name: existing.name,
                registrationNumber: existing.registrationNumber || '',
                label: null,
              }
            : {
                stockItem: stock,
                name: stock.productId,
                registrationNumber: '',
                label: null,
                labelError: `Prodotto con id ${stock.productId} non trovato`,
              },
        );
        continue;
      }
      results.push({
        stockItem: stock,
        name: 'Sconosciuto',
        registrationNumber: '',
        label: null,
        labelError: 'Stock senza productId o dati prodotto',
      });
    }
    return results;
  }

  async enrichRegistrationNumbers(products: ResolvedProduct[]): Promise<void> {
    const lookupService = new ProductRegistrationLookupService();
    for (const product of products) {
      if (product.registrationNumber || !product.name || product.name === 'Sconosciuto') continue;
      const match = lookupService.findProduct(product.name);
      if (match) {
        this.assignRegistrationNumber(product, match.registrationNumber);
        continue;
      }
      const candidates = lookupService.findTopCandidates(product.name, 15);
      if (candidates.length > 0) {
        const llmResult = await llmFindBestProductInRegistry(
          product.name,
          candidates.map((candidate) => ({
            registrationNumber: candidate.registrationNumber,
            productName: candidate.productName,
          })),
        );
        if (llmResult) {
          console.log(
            `[PU-MATCHER] LLM fallback matched "${product.name}" → "${llmResult.productName}" (${llmResult.registrationNumber}) confidence=${llmResult.confidence}`,
          );
          this.assignRegistrationNumber(product, llmResult.registrationNumber);
          continue;
        }
      }
      product.isFertilizer = true;
      console.log(
        `[PU-MATCHER] Product "${product.name}" not found in fts registry, marked as fertilizer/adjuvant`,
      );
    }
  }

  async loadLabels(products: ResolvedProduct[], context?: DosageAgentContext): Promise<void> {
    const toLoad = products.filter(
      (product) => product.registrationNumber && !product.labelError && !product.isFertilizer,
    );
    if (toLoad.length === 0) {
      this.markMissingRegistrationNumbers(products);
      return;
    }
    const cachedRecords = await this.labelExtractionRepository.findManyByProductAndRegistration(
      toLoad.map((product) => ({
        productName: product.name,
        registrationNumber: product.registrationNumber,
      })),
    );
    const cachedByRegistration = new Map<string, LabelExtractionRecord>();
    cachedRecords.forEach((record) => cachedByRegistration.set(record.registrationNumber, record));
    const uncached: ResolvedProduct[] = [];
    for (const product of toLoad) {
      const cached = cachedByRegistration.get(product.registrationNumber);
      if (cached) product.label = cached.label as Label;
      else uncached.push(product);
    }
    await this.extractUncachedLabels(uncached, context);
    this.markMissingRegistrationNumbers(products);
  }

  private assignRegistrationNumber(product: ResolvedProduct, registrationNumber: string): void {
    product.registrationNumber = registrationNumber;
    if (product.stockItem.product) {
      product.stockItem.product = { ...product.stockItem.product, registrationNumber };
    }
  }

  private async extractUncachedLabels(
    products: ResolvedProduct[],
    context?: DosageAgentContext,
  ): Promise<void> {
    if (products.length === 0) return;
    try {
      const useCase = new BulkExtractLabelsUseCase(
        this.labelExtractionRepository,
        this.labelTextProvider,
        this.labelExtractor,
      );
      const items: BulkExtractItemInput[] = products.map((product) => ({
        name: product.name,
        regNumber: product.registrationNumber,
      }));
      const outcome = await useCase.execute({ items, context });
      const resultsByRegistration = new Map(
        outcome.results.map((result) => [result.regNumber, result]),
      );
      for (const product of products) {
        const result = resultsByRegistration.get(product.registrationNumber);
        if (result?.label) product.label = result.label;
        else product.labelError = result?.error || 'Estrazione label fallita';
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      products.forEach((product) => {
        product.labelError = `Estrazione label fallita: ${message}`;
      });
    }
  }

  private markMissingRegistrationNumbers(products: ResolvedProduct[]): void {
    for (const product of products) {
      if (
        !product.registrationNumber &&
        !product.labelError &&
        !product.label &&
        !product.isFertilizer
      ) {
        product.labelError = 'Impossibile risolvere label senza numero di registrazione';
      }
    }
  }
}
