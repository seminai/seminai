import { LabelExtraction as LabelExtractionRow, Prisma, PrismaClient } from '@prisma/client';
import { createHash } from 'crypto';
import {
  FindLabelExtractionInput,
  ILabelExtractionRepository,
  LabelCategory,
  LabelExtractionRecord,
  SavedLabelExtraction,
  SearchByProductNameInput,
} from '../../domain/repositories/ILabelExtractionRepository';
import {
  buildRegistrationNumberVariants,
  normalizeLabelProductName,
  normalizeLabelRegistrationNumber,
} from '../../domain/utils/labelNormalization';
import { labelExtractionMapper } from './labelExtractionMapper';

const ACTIVE_LABEL_WHERE = { isArchived: false } as const;

export class PrismaLabelExtractionRepository implements ILabelExtractionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string): Promise<LabelExtractionRecord | null> {
    const found = await this.prisma.labelExtraction.findFirst({
      where: { id, ...ACTIVE_LABEL_WHERE },
    });
    return found ? labelExtractionMapper.mapToDomain(found) : null;
  }

  async findByProductAndRegistration(
    params: FindLabelExtractionInput,
  ): Promise<LabelExtractionRecord | null> {
    const productName = params.productName.trim();
    const registrationNumber = params.registrationNumber.trim();
    const exact = await this.findExactActive(productName, registrationNumber);
    if (exact) return labelExtractionMapper.mapToDomain(exact);
    const insensitive = await this.findInsensitiveActive(productName, registrationNumber);
    if (insensitive) return labelExtractionMapper.mapToDomain(insensitive);
    const byAlias = await this.findByAlias(productName, registrationNumber);
    if (byAlias) return labelExtractionMapper.mapToDomain(byAlias);
    const byRegistration = await this.findActiveByRegistration(registrationNumber);
    return byRegistration ? labelExtractionMapper.mapToDomain(byRegistration) : null;
  }

  async findManyByProductAndRegistration(
    params: ReadonlyArray<FindLabelExtractionInput>,
  ): Promise<ReadonlyArray<LabelExtractionRecord>> {
    const rows = await Promise.all(params.map((item) => this.findByProductAndRegistration(item)));
    const unique = new Map<string, LabelExtractionRecord>();
    for (const row of rows) if (row) unique.set(row.id, row);
    return [...unique.values()];
  }

  async saveExtraction(input: SavedLabelExtraction): Promise<LabelExtractionRecord> {
    const normalized = labelExtractionMapper.buildNormalizedInput(input);
    const exact = await this.findExactActive(input.productName, input.registrationNumber);
    const canonical = await this.findCanonicalForInput(input, normalized.normalizedRegistration);
    const target = exact ?? canonical;
    if (target) {
      await this.createAlias(target.id, input, normalized);
      const existingHasBetterData =
        target.extractionConfidence > 0 && input.extractionConfidence === 0;
      if (existingHasBetterData) return labelExtractionMapper.mapToDomain(target);
      const updated = await this.prisma.labelExtraction.update({
        where: { id: target.id },
        data: labelExtractionMapper.buildSaveUpdateData(input, normalized),
      });
      return labelExtractionMapper.mapToDomain(updated);
    }
    const created = await this.prisma.labelExtraction.create({
      data: labelExtractionMapper.buildCreateData(input, normalized),
    });
    await this.createAlias(created.id, input, normalized);
    return labelExtractionMapper.mapToDomain(created);
  }

  async listAll(options?: { includeArchived?: boolean }): Promise<LabelExtractionRecord[]> {
    const rows = await this.prisma.labelExtraction.findMany({
      where: options?.includeArchived ? undefined : ACTIVE_LABEL_WHERE,
    });
    return rows.map((row) => labelExtractionMapper.mapToDomain(row));
  }

  async deleteManyByIds(ids: ReadonlyArray<string>): Promise<number> {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const res = await this.prisma.labelExtraction.deleteMany({ where: { id: { in: ids } } });
    return res.count;
  }

  async updateById(
    id: string,
    input: Partial<SavedLabelExtraction>,
  ): Promise<LabelExtractionRecord | null> {
    const existing = await this.prisma.labelExtraction.findFirst({
      where: { id, ...ACTIVE_LABEL_WHERE },
    });
    if (!existing) return null;
    const updateData = labelExtractionMapper.buildPartialUpdateData(input);
    const updated = await this.prisma.labelExtraction.update({ where: { id }, data: updateData });
    if (input.productName || input.registrationNumber) {
      await this.createAlias(
        updated.id,
        {
          productName: updated.productName,
          registrationNumber: updated.registrationNumber,
          category: updated.category as LabelCategory,
        },
        {
          normalizedProduct: updated.normalizedProductName ?? '',
          normalizedRegistration: updated.normalizedRegistrationNumber,
        },
      );
    }
    return labelExtractionMapper.mapToDomain(updated);
  }

  async updateVerificationStatus(
    id: string,
    isVerified: boolean,
  ): Promise<LabelExtractionRecord | null> {
    const existing = await this.prisma.labelExtraction.findFirst({
      where: { id, ...ACTIVE_LABEL_WHERE },
    });
    if (!existing) return null;
    const updated = await this.prisma.labelExtraction.update({
      where: { id },
      data: { isVerified },
    });
    return labelExtractionMapper.mapToDomain(updated);
  }

  async searchByProductName(
    params: SearchByProductNameInput,
  ): Promise<ReadonlyArray<LabelExtractionRecord>> {
    const { productName, registrationNumber, limit = 5 } = params;
    const trimmedName = productName.trim();
    if (trimmedName.length < 2) return [];
    const labelMatches = await this.searchActiveLabels(trimmedName, registrationNumber, limit);
    if (labelMatches.length >= limit) {
      return labelMatches.map((row) => labelExtractionMapper.mapToDomain(row));
    }
    const aliasMatches = await this.searchAliases(trimmedName, registrationNumber, limit);
    const combined = new Map<string, LabelExtractionRecord>();
    for (const row of labelMatches) combined.set(row.id, labelExtractionMapper.mapToDomain(row));
    for (const row of aliasMatches) combined.set(row.id, labelExtractionMapper.mapToDomain(row));
    return [...combined.values()].slice(0, limit);
  }

  async deleteEmptyExtractions(): Promise<number> {
    const rows = await this.prisma.labelExtraction.findMany({
      where: { extractionConfidence: 0, ...ACTIVE_LABEL_WHERE },
      select: { id: true, label: true },
    });
    const emptyIds = rows
      .filter((row) => labelExtractionMapper.isEmptyLabel(row.label))
      .map((row) => row.id);
    if (emptyIds.length === 0) return 0;
    const res = await this.prisma.labelExtraction.deleteMany({
      where: { id: { in: emptyIds } },
    });
    return res.count;
  }

  private async findExactActive(
    productName: string,
    registrationNumber: string,
  ): Promise<LabelExtractionRow | null> {
    return this.prisma.labelExtraction.findFirst({
      where: { productName, registrationNumber, ...ACTIVE_LABEL_WHERE },
    });
  }

  private async findInsensitiveActive(
    productName: string,
    registrationNumber: string,
  ): Promise<LabelExtractionRow | null> {
    return this.prisma.labelExtraction.findFirst({
      where: {
        productName: { equals: productName, mode: 'insensitive' },
        registrationNumber: { equals: registrationNumber, mode: 'insensitive' },
        ...ACTIVE_LABEL_WHERE,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  private async findByAlias(
    productName: string,
    registrationNumber: string,
  ): Promise<LabelExtractionRow | null> {
    const normalizedProduct = normalizeLabelProductName(productName);
    const normalizedRegistration = normalizeLabelRegistrationNumber(registrationNumber);
    const alias = await this.prisma.labelAlias.findFirst({
      where: {
        normalizedProductName: normalizedProduct,
        normalizedRegistrationNumber: normalizedRegistration,
        labelExtraction: ACTIVE_LABEL_WHERE,
      },
      include: { labelExtraction: true },
      orderBy: { createdAt: 'desc' },
    });
    return alias?.labelExtraction ?? null;
  }
  private async findActiveByRegistration(
    registrationNumber: string,
  ): Promise<LabelExtractionRow | null> {
    const normalized = normalizeLabelRegistrationNumber(registrationNumber);
    if (!normalized) return null;
    return this.prisma.labelExtraction.findFirst({
      where: {
        category: LabelCategory.FITO,
        normalizedRegistrationNumber: normalized,
        ...ACTIVE_LABEL_WHERE,
      },
      orderBy: { updatedAt: 'desc' },
    });
  }
  private async findCanonicalForInput(
    input: SavedLabelExtraction,
    normalizedRegistration: string | null,
  ): Promise<LabelExtractionRow | null> {
    if (input.category !== LabelCategory.FITO || !normalizedRegistration) return null;
    return this.prisma.labelExtraction.findFirst({
      where: {
        category: input.category,
        normalizedRegistrationNumber: normalizedRegistration,
        ...ACTIVE_LABEL_WHERE,
      },
      orderBy: [{ isVerified: 'desc' }, { extractionConfidence: 'desc' }, { updatedAt: 'desc' }],
    });
  }
  private async searchActiveLabels(
    productName: string,
    registrationNumber: string | undefined,
    limit: number,
  ): Promise<LabelExtractionRow[]> {
    const orConditions: Prisma.LabelExtractionWhereInput[] = [
      { productName: { contains: productName, mode: 'insensitive' } },
    ];
    for (const variant of registrationNumber
      ? buildRegistrationNumberVariants(registrationNumber)
      : []) {
      orConditions.push({ registrationNumber: variant });
    }
    const normalized = registrationNumber
      ? normalizeLabelRegistrationNumber(registrationNumber)
      : null;
    if (normalized) orConditions.push({ normalizedRegistrationNumber: normalized });
    return this.prisma.labelExtraction.findMany({
      where: { OR: orConditions, ...ACTIVE_LABEL_WHERE },
      orderBy: { updatedAt: 'desc' },
      take: limit,
    });
  }
  private async searchAliases(
    productName: string,
    registrationNumber: string | undefined,
    limit: number,
  ): Promise<LabelExtractionRow[]> {
    const normalized = registrationNumber
      ? normalizeLabelRegistrationNumber(registrationNumber)
      : null;
    const aliases = await this.prisma.labelAlias.findMany({
      where: {
        OR: [
          { productName: { contains: productName, mode: 'insensitive' } },
          ...(normalized ? [{ normalizedRegistrationNumber: normalized }] : []),
        ],
        labelExtraction: ACTIVE_LABEL_WHERE,
      },
      include: { labelExtraction: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return aliases.map((alias) => alias.labelExtraction);
  }
  private async createAlias(
    labelExtractionId: string,
    input: Pick<SavedLabelExtraction, 'productName' | 'registrationNumber' | 'category'>,
    normalized: { normalizedProduct: string; normalizedRegistration: string | null },
  ): Promise<void> {
    await this.prisma.labelAlias.createMany({
      data: [
        {
          id: createHash('md5')
            .update(
              `${labelExtractionId}:${normalized.normalizedProduct}:${normalized.normalizedRegistration ?? ''}`,
            )
            .digest('hex'),
          labelExtractionId,
          productName: input.productName,
          registrationNumber: input.registrationNumber,
          category: input.category,
          normalizedProductName: normalized.normalizedProduct,
          normalizedRegistrationNumber: normalized.normalizedRegistration,
        },
      ],
      skipDuplicates: true,
    });
  }
}
