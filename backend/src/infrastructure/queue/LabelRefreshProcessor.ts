import {
  LabelCategory as PrismaLabelCategory,
  LabelExtraction,
  LabelRefreshStatus as PrismaRefreshStatus,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { Label, isUsableLabel } from '../../domain/dtos/label.dto';
import {
  LabelCategory,
  LabelExtractionRecord,
  LabelRefreshStatus,
  SavedLabelExtraction,
} from '../../domain/repositories/ILabelExtractionRepository';
import { LabelHistoryActor } from '../../domain/dtos/label-history.dto';
import { calculateLabelChanges, createLabelSnapshot } from '../../domain/utils/labelDiff';
import { buildRegistrationNumberVariants } from '../../domain/utils/labelNormalization';
import { buildPesticideSummary } from '../../application/use-cases/product/buildProductLabelSummary';
import { PrismaLabelExtractionRepository } from '../repositories/PrismaLabelExtractionRepository';
import { PrismaLabelHistoryRepository } from '../repositories/PrismaLabelHistoryRepository';
import { labelExtractionMapper } from '../repositories/labelExtractionMapper';
import { ExtractLabelAdapter } from '../services/tool/extractLabel.adapter';
import { GetLabelTextProvider } from '../services/tool/getLabelText.provider';
import { LabelDeduplicationService } from '../services/labels/LabelDeduplicationService';
import {
  LabelRefreshItemResult,
  LabelRefreshJobData,
  LabelRefreshJobResult,
} from './LabelRefreshTypes';

const DEFAULT_TTL_DAYS = 7;
const DEFAULT_BATCH_LIMIT = 50;
const MAX_BATCH_LIMIT = 200;

export class LabelRefreshProcessor {
  private readonly labelRepository: PrismaLabelExtractionRepository;
  private readonly historyRepository: PrismaLabelHistoryRepository;
  private readonly deduplicationService: LabelDeduplicationService;
  private readonly textProvider = new GetLabelTextProvider();
  private readonly extractor = new ExtractLabelAdapter();

  constructor(private readonly prisma: PrismaClient) {
    this.labelRepository = new PrismaLabelExtractionRepository(prisma);
    this.historyRepository = new PrismaLabelHistoryRepository(prisma);
    this.deduplicationService = new LabelDeduplicationService(prisma);
  }

  async process(input: LabelRefreshJobData): Promise<LabelRefreshJobResult> {
    const deduplicate = await this.deduplicationService.deduplicateActiveLabels();
    const candidates = await this.loadCandidates(input);
    const results: LabelRefreshItemResult[] = [];
    for (const candidate of candidates) {
      const result = input.dryRun
        ? this.buildSkippedResult(candidate)
        : await this.refreshOne(candidate);
      results.push(result);
    }
    return this.buildJobResult(results, deduplicate, candidates.length);
  }

  private async loadCandidates(input: LabelRefreshJobData): Promise<LabelExtraction[]> {
    const limit = this.resolveLimit(input.limit);
    const where = this.buildCandidateWhere(input);
    return this.prisma.labelExtraction.findMany({
      where,
      orderBy: [{ lastRefreshedAt: 'asc' }, { updatedAt: 'asc' }],
      take: limit,
    });
  }

  private buildCandidateWhere(input: LabelRefreshJobData): Prisma.LabelExtractionWhereInput {
    const base: Prisma.LabelExtractionWhereInput = {
      category: PrismaLabelCategory.FITO,
      isArchived: false,
      canonicalLabelExtractionId: null,
    };
    if (input.mode === 'ids') {
      return { ...base, id: { in: [...(input.labelExtractionIds ?? [])] } };
    }
    if (input.mode === 'all') return base;
    return {
      ...base,
      OR: [
        { lastRefreshedAt: null },
        { lastRefreshedAt: { lt: this.resolveStaleBefore() } },
        { lastRefreshStatus: PrismaRefreshStatus.FAILED },
      ],
    };
  }

  private async refreshOne(row: LabelExtraction): Promise<LabelRefreshItemResult> {
    try {
      const fetched = await this.textProvider.getText(row.productName, row.registrationNumber);
      if (!fetched) return await this.markFailed(row, 'Label text not available from SIAN');
      const rawTextHash = fetched.rawTextHash ?? labelExtractionMapper.hashText(fetched.text);
      const hasSamePdfHash = !!row.sourcePdfHash && row.sourcePdfHash === fetched.sourcePdfHash;
      const hasSameTextHash = !!row.rawTextHash && row.rawTextHash === rawTextHash;
      if (hasSamePdfHash || hasSameTextHash) {
        await this.labelRepository.updateById(row.id, {
          lastRefreshedAt: new Date(),
          lastRefreshStatus: LabelRefreshStatus.SUCCESS,
          lastRefreshError: null,
          sourcePdfHash: fetched.sourcePdfHash ?? row.sourcePdfHash,
          rawTextHash,
          officialSourceUrl: fetched.officialSourceUrl ?? row.officialSourceUrl,
          sourceUrl: fetched.url,
        });
        return this.buildResult(row, 'unchanged');
      }
      const label = await this.extractor.extract(fetched.text);
      if (!isUsableLabel(label)) return await this.markFailed(row, 'Extracted label is unusable');
      const updateData = this.buildRefreshUpdate(row, label, fetched.text, fetched.url, {
        sourcePdfHash: fetched.sourcePdfHash ?? null,
        rawTextHash,
        officialSourceUrl: fetched.officialSourceUrl ?? null,
      });
      await this.saveHistory(row, updateData);
      const updated = await this.labelRepository.updateById(row.id, updateData);
      if (updated) await this.refreshProductSummaries(updated);
      return this.buildResult(row, 'refreshed');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown refresh error';
      return this.markFailed(row, message);
    }
  }

  private buildRefreshUpdate(
    row: LabelExtraction,
    label: Label,
    rawText: string,
    sourceUrl: string,
    hashes: {
      readonly sourcePdfHash: string | null;
      readonly rawTextHash: string;
      readonly officialSourceUrl: string | null;
    },
  ): Partial<SavedLabelExtraction> {
    return {
      sourceUrl,
      sourcePdfHash: hashes.sourcePdfHash,
      rawTextHash: hashes.rawTextHash,
      officialSourceUrl: hashes.officialSourceUrl,
      category: LabelCategory.FITO,
      label,
      rawText,
      extractionConfidence: label.extraction_confidence ?? row.extractionConfidence,
      extractedFields: label.extracted_fields ?? [],
      errors: label.errors ?? [],
      qualityExtraction: [],
      lastRefreshedAt: new Date(),
      lastRefreshStatus: LabelRefreshStatus.SUCCESS,
      lastRefreshError: null,
    };
  }

  private async saveHistory(
    row: LabelExtraction,
    updateData: Partial<SavedLabelExtraction>,
  ): Promise<void> {
    const existing = labelExtractionMapper.mapToDomain(row);
    const changes = calculateLabelChanges(existing, updateData as Partial<LabelExtractionRecord>);
    if (changes.length === 0) return;
    await this.historyRepository.create({
      labelExtractionId: row.id,
      actorType: LabelHistoryActor.SYSTEM,
      actorLabel: 'Label refresh queue',
      changes,
      previousSnapshot: createLabelSnapshot(existing),
    });
  }

  private async refreshProductSummaries(record: LabelExtractionRecord): Promise<void> {
    const variants = buildRegistrationNumberVariants(record.registrationNumber);
    const products = await this.prisma.product.findMany({
      where: { category: 'PESTICIDE', registrationNumber: { in: [...variants] } },
      select: { id: true },
      take: 500,
    });
    const summary = buildPesticideSummary(
      record.label,
      record.id,
    ) as unknown as Prisma.InputJsonValue;
    await Promise.all(
      products.map((product) =>
        this.prisma.product.update({
          where: { id: product.id },
          data: { labelMetadata: summary },
        }),
      ),
    );
  }

  private async markFailed(row: LabelExtraction, error: string): Promise<LabelRefreshItemResult> {
    await this.labelRepository.updateById(row.id, {
      lastRefreshedAt: new Date(),
      lastRefreshStatus: LabelRefreshStatus.FAILED,
      lastRefreshError: error.slice(0, 1000),
    });
    return this.buildResult(row, 'failed', error);
  }

  private buildSkippedResult(row: LabelExtraction): LabelRefreshItemResult {
    return this.buildResult(row, 'skipped');
  }

  private buildResult(
    row: LabelExtraction,
    status: LabelRefreshItemResult['status'],
    error?: string,
  ): LabelRefreshItemResult {
    return {
      labelExtractionId: row.id,
      productName: row.productName,
      registrationNumber: row.registrationNumber,
      status,
      error,
    };
  }

  private buildJobResult(
    results: readonly LabelRefreshItemResult[],
    deduplicate: { readonly archivedDuplicates: number; readonly aliasesCreated: number },
    scanned: number,
  ): LabelRefreshJobResult {
    return {
      scanned,
      refreshed: results.filter((row) => row.status === 'refreshed').length,
      unchanged: results.filter((row) => row.status === 'unchanged').length,
      failed: results.filter((row) => row.status === 'failed').length,
      skipped: results.filter((row) => row.status === 'skipped').length,
      archivedDuplicates: deduplicate.archivedDuplicates,
      aliasesCreated: deduplicate.aliasesCreated,
      results,
    };
  }

  private resolveLimit(limit: number | undefined): number {
    const raw = limit ?? Number(process.env.LABEL_REFRESH_BATCH_LIMIT ?? DEFAULT_BATCH_LIMIT);
    return Math.max(1, Math.min(MAX_BATCH_LIMIT, Number.isFinite(raw) ? raw : DEFAULT_BATCH_LIMIT));
  }

  private resolveStaleBefore(): Date {
    const raw = Number(process.env.LABEL_REFRESH_TTL_DAYS ?? DEFAULT_TTL_DAYS);
    const days = Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TTL_DAYS;
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  }
}
