import {
  LabelCategory as PrismaLabelCategory,
  LabelExtraction,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { createHash } from 'crypto';
import { Label } from '../../../domain/dtos/label.dto';
import { normalizeLabelProductName } from '../../../domain/utils/labelNormalization';
import { labelExtractionMapper } from '../../repositories/labelExtractionMapper';

export interface LabelDeduplicateResult {
  readonly archivedDuplicates: number;
  readonly aliasesCreated: number;
}

export class LabelDeduplicationService {
  constructor(private readonly prisma: PrismaClient) {}

  async deduplicateActiveLabels(): Promise<LabelDeduplicateResult> {
    const rows = await this.prisma.labelExtraction.findMany({
      where: {
        category: PrismaLabelCategory.FITO,
        isArchived: false,
        normalizedRegistrationNumber: { not: null },
      },
      orderBy: [{ isVerified: 'desc' }, { extractionConfidence: 'desc' }, { updatedAt: 'desc' }],
    });
    const groups = this.groupByRegistration(rows);
    let archivedDuplicates = 0;
    let aliasesCreated = 0;
    for (const group of groups) {
      if (group.length <= 1) continue;
      const [canonical, ...duplicates] = this.sortCanonicalFirst(group);
      aliasesCreated += await this.createAliases(canonical.id, group);
      archivedDuplicates += await this.archiveDuplicates(canonical.id, duplicates);
    }
    return { archivedDuplicates, aliasesCreated };
  }

  private groupByRegistration(rows: readonly LabelExtraction[]): LabelExtraction[][] {
    const groups = new Map<string, LabelExtraction[]>();
    for (const row of rows) {
      const key = row.normalizedRegistrationNumber;
      if (!key) continue;
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
    return [...groups.values()];
  }

  private sortCanonicalFirst(rows: readonly LabelExtraction[]): LabelExtraction[] {
    return [...rows].sort((left, right) => this.scoreLabel(right) - this.scoreLabel(left));
  }

  private scoreLabel(row: LabelExtraction): number {
    const label = labelExtractionMapper.mapToDomain(row).label as Label;
    const doseScore = Array.isArray(label.dosaggi_dettagliati)
      ? label.dosaggi_dettagliati.length
      : 0;
    const cropScore = Array.isArray(label.colture_target) ? label.colture_target.length : 0;
    return (
      (row.isVerified ? 1_000_000 : 0) +
      row.extractionConfidence * 10_000 +
      doseScore * 100 +
      cropScore * 10 +
      Math.min(row.rawText.length, 10_000) / 10_000
    );
  }

  private async createAliases(
    canonicalId: string,
    rows: readonly LabelExtraction[],
  ): Promise<number> {
    const data = rows.map((row) => ({
      id: this.hashAliasId(canonicalId, row.productName, row.registrationNumber),
      labelExtractionId: canonicalId,
      productName: row.productName,
      registrationNumber: row.registrationNumber,
      category: row.category,
      normalizedProductName:
        row.normalizedProductName ?? normalizeLabelProductName(row.productName),
      normalizedRegistrationNumber: row.normalizedRegistrationNumber,
    }));
    const result = await this.prisma.labelAlias.createMany({ data, skipDuplicates: true });
    return result.count;
  }

  private async archiveDuplicates(
    canonicalId: string,
    rows: readonly LabelExtraction[],
  ): Promise<number> {
    const ids = rows.map((row) => row.id);
    const result = await this.prisma.labelExtraction.updateMany({
      where: { id: { in: ids } },
      data: {
        isArchived: true,
        archivedAt: new Date(),
        archivedReason: 'duplicate_registration_number',
        canonicalLabelExtractionId: canonicalId,
      },
    });
    await this.repointProductSummaries(canonicalId, ids);
    return result.count;
  }

  private async repointProductSummaries(
    canonicalId: string,
    duplicateIds: readonly string[],
  ): Promise<void> {
    if (duplicateIds.length === 0) return;
    await this.prisma.$executeRaw`
      UPDATE "Product"
      SET "labelMetadata" = jsonb_set(
        "labelMetadata"::jsonb,
        '{labelExtractionId}',
        to_jsonb(${canonicalId}::text)
      )
      WHERE "labelMetadata" IS NOT NULL
      AND "labelMetadata"->>'labelExtractionId' IN (${Prisma.join([...duplicateIds])})
    `;
  }

  private hashAliasId(
    canonicalId: string,
    productName: string,
    registrationNumber: string,
  ): string {
    return createHash('md5')
      .update(`${canonicalId}:${productName}:${registrationNumber}`)
      .digest('hex');
  }
}
