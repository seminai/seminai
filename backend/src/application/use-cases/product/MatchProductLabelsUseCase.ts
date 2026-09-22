import { PrismaClient } from '@prisma/client';
import { cleanRegNumber } from '../../../infrastructure/services/agents/dosage_agent/cleanRegNumber';
import { PrismaLabelExtractionRepository } from '../../../infrastructure/repositories/PrismaLabelExtractionRepository';
import { GetLabelTextProvider } from '../../../infrastructure/services/tool/getLabelText.provider';
import { ExtractLabelAdapter } from '../../../infrastructure/services/tool/extractLabel.adapter';
import { BulkExtractLabelsUseCase } from '../label/BulkExtractLabelsUseCase';
import {
  ProductLabelSummary,
  buildFertilizerSummary,
  buildPesticideSummary,
  isStaleSummary,
} from './buildProductLabelSummary';

export type { ProductLabelSummary } from './buildProductLabelSummary';

type SupportedCategory = 'PESTICIDE' | 'FERTILIZER';
type LabelCategoryKey = 'FITO' | 'FERTILIZER';

interface LabelMatch {
  readonly id: string;
  readonly label: unknown;
  readonly category: LabelCategoryKey;
  readonly regNumber: string;
  readonly normalizedRegNumber: string | null;
  readonly productName: string;
}

interface ProductForMatching {
  readonly id: string;
  readonly name: string;
  readonly registrationNumber: string | null;
  readonly category: SupportedCategory;
}

export interface MatchProductLabelsInput {
  readonly productIds: string[];
  readonly forceRefresh?: boolean;
}

export interface MatchProductLabelsOutput {
  readonly matched: number;
  readonly extracted: number;
  readonly failed: number;
  readonly skipped: number;
  readonly errors: string[];
}

export class MatchProductLabelsUseCase {
  constructor(private readonly prisma: PrismaClient) {}

  async execute(input: MatchProductLabelsInput): Promise<MatchProductLabelsOutput> {
    if (input.productIds.length === 0) {
      return { matched: 0, extracted: 0, failed: 0, skipped: 0, errors: [] };
    }
    const products = await this.loadProducts(input.productIds);
    const toMatch = products.filter((p) =>
      input.forceRefresh ? true : isStaleSummary(p.labelMetadata),
    );
    const skipped = products.length - toMatch.length;
    if (toMatch.length === 0) {
      return { matched: 0, extracted: 0, failed: 0, skipped, errors: [] };
    }
    console.log(`[LABEL-MATCHING] Processing ${toMatch.length} products`);
    return this.matchProducts(toMatch, skipped);
  }

  private async loadProducts(
    productIds: string[],
  ): Promise<Array<ProductForMatching & { labelMetadata: unknown }>> {
    const rows = await this.prisma.product.findMany({
      where: { id: { in: productIds }, category: { in: ['PESTICIDE', 'FERTILIZER'] } },
      select: {
        id: true,
        name: true,
        registrationNumber: true,
        category: true,
        labelMetadata: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      registrationNumber: r.registrationNumber,
      category: r.category as SupportedCategory,
      labelMetadata: r.labelMetadata,
    }));
  }

  private async matchProducts(
    products: ProductForMatching[],
    skippedCount: number,
  ): Promise<MatchProductLabelsOutput> {
    const labelMap = await this.loadExistingLabels(products);
    const missing: ProductForMatching[] = [];
    let matched = 0;
    for (const product of products) {
      const label = this.findLabel(product, labelMap);
      if (label) {
        await this.persistSummary(product, label);
        matched++;
        continue;
      }
      if (product.category === 'PESTICIDE' && product.registrationNumber) {
        missing.push(product);
      }
    }
    const extraction = await this.extractMissingLabels(missing);
    const failed = extraction.filter((r) => r.status === 'failed').length;
    const extracted = extraction.length - failed;
    const errors = extraction.filter((r) => r.error).map((r) => r.error!);
    const skipped = skippedCount + (products.length - matched - extraction.length);
    console.log(
      `[LABEL-MATCHING] Done: ${matched} matched, ${extracted} extracted, ${failed} failed, ${skipped} skipped`,
    );
    return { matched, extracted, failed, skipped, errors };
  }

  private async loadExistingLabels(
    products: ProductForMatching[],
  ): Promise<Map<string, LabelMatch>> {
    const regNumbers = new Set<string>();
    const productNames = new Set<string>();
    for (const p of products) {
      if (p.registrationNumber) {
        regNumbers.add(p.registrationNumber);
        const cleaned = cleanRegNumber(p.registrationNumber);
        if (cleaned && cleaned !== '0') {
          regNumbers.add(cleaned);
          regNumbers.add('0' + cleaned);
          regNumbers.add('00' + cleaned);
        }
      }
      productNames.add(p.name.toLowerCase().trim());
    }
    const labels = await this.prisma.labelExtraction.findMany({
      where: {
        isArchived: false,
        OR: [
          { registrationNumber: { in: [...regNumbers] } },
          { normalizedRegistrationNumber: { in: [...regNumbers] } },
          { productName: { in: [...productNames], mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        label: true,
        category: true,
        registrationNumber: true,
        normalizedRegistrationNumber: true,
        productName: true,
      },
    });
    return this.buildLabelMap(labels);
  }

  private buildLabelMap(
    labels: ReadonlyArray<{
      id: string;
      label: unknown;
      category: string;
      registrationNumber: string;
      normalizedRegistrationNumber: string | null;
      productName: string;
    }>,
  ): Map<string, LabelMatch> {
    const map = new Map<string, LabelMatch>();
    for (const label of labels) {
      const entry: LabelMatch = {
        id: label.id,
        label: label.label,
        category: label.category as LabelCategoryKey,
        regNumber: label.registrationNumber,
        normalizedRegNumber: label.normalizedRegistrationNumber,
        productName: label.productName,
      };
      const normalizedReg =
        label.normalizedRegistrationNumber ?? cleanRegNumber(label.registrationNumber);
      if (normalizedReg && normalizedReg !== '0') {
        map.set(`${entry.category}:reg:${normalizedReg}`, entry);
      }
      map.set(`${entry.category}:reg:${label.registrationNumber}`, entry);
      map.set(`${entry.category}:name:${label.productName.toLowerCase().trim()}`, entry);
    }
    return map;
  }

  private findLabel(
    product: ProductForMatching,
    labelMap: Map<string, LabelMatch>,
  ): LabelMatch | null {
    const categoryKey: LabelCategoryKey = product.category === 'PESTICIDE' ? 'FITO' : 'FERTILIZER';
    if (product.registrationNumber) {
      const normalizedReg = cleanRegNumber(product.registrationNumber);
      if (normalizedReg && normalizedReg !== '0') {
        const byNormalizedReg = labelMap.get(`${categoryKey}:reg:${normalizedReg}`);
        if (byNormalizedReg) return byNormalizedReg;
      }
      const byReg = labelMap.get(`${categoryKey}:reg:${product.registrationNumber}`);
      if (byReg) return byReg;
    }
    const byName = labelMap.get(`${categoryKey}:name:${product.name.toLowerCase().trim()}`);
    return byName ?? null;
  }

  private async persistSummary(product: ProductForMatching, label: LabelMatch): Promise<void> {
    const summary: ProductLabelSummary =
      product.category === 'PESTICIDE'
        ? buildPesticideSummary(label.label, label.id)
        : buildFertilizerSummary(label.label, label.id);
    await this.prisma.product.update({
      where: { id: product.id },
      data: { labelMetadata: summary as unknown as object },
    });
    console.log(`[LABEL-MATCHING] ✓ Matched "${product.id}" -> label ${label.id}`);
  }

  private async extractMissingLabels(
    products: ProductForMatching[],
  ): Promise<Array<{ productId: string; status: 'ok' | 'failed'; error?: string }>> {
    if (products.length === 0) return [];
    console.log(`[LABEL-MATCHING] Extracting ${products.length} missing labels from SIAN...`);
    const repo = new PrismaLabelExtractionRepository(this.prisma);
    const useCase = new BulkExtractLabelsUseCase(
      repo,
      new GetLabelTextProvider(),
      new ExtractLabelAdapter(),
    );
    const items = products.map((p) => ({ name: p.name, regNumber: p.registrationNumber! }));
    const { results } = await useCase.execute({ items, concurrency: 3 });
    const resultByKey = new Map(results.map((r) => [`${r.name}|${r.regNumber}`, r]));
    const out: Array<{ productId: string; status: 'ok' | 'failed'; error?: string }> = [];
    for (const product of products) {
      const key = `${product.name}|${product.registrationNumber}`;
      const extracted = resultByKey.get(key);
      const isExtracted =
        extracted && (extracted.status === 'extracted' || extracted.status === 'cached');
      if (isExtracted && extracted.record) {
        await this.persistSummary(product, {
          id: extracted.record.id,
          label: extracted.record.label,
          category: 'FITO',
          regNumber: product.registrationNumber!,
          normalizedRegNumber: extracted.record.normalizedRegistrationNumber,
          productName: product.name,
        });
        out.push({ productId: product.id, status: 'ok' });
        continue;
      }
      const error = extracted?.error ?? 'Label extraction failed';
      console.log(`[LABEL-MATCHING] ✗ Failed for "${product.name}": ${error}`);
      out.push({ productId: product.id, status: 'failed', error });
    }
    return out;
  }
}
