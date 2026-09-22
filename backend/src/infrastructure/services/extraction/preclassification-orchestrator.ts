import { createHash } from 'node:crypto';
import { v4 as uuid } from 'uuid';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type Company } from '../../../domain/entities/Company';
import {
  type PreclassificationCompany,
  type PreclassificationItemStatus,
  type StartPreclassificationItemDto,
  type StartPreclassificationResponseDto,
} from '../../../domain/dtos/preclassification.dto';
import { getPreclassificationQueue } from '../../queue/PreclassificationQueue';
import { getCachedResult, seedPreclassification, setItemResult } from './preclassification-store';

interface PreclassifyFileInput {
  readonly buffer: Buffer;
  readonly originalname: string;
  readonly mimetype: string;
}

interface PreparedItem {
  readonly itemId: string;
  readonly fileIndex: number;
  readonly fileName: string;
  readonly file: PreclassifyFileInput;
  readonly fileHash: string;
}

function toCompactCompany(company: Company): PreclassificationCompany {
  return {
    id: company.id,
    name: company.name,
    vatNumber: company.vatNumber,
    fiscalCode: company.fiscalCode,
    cuaa: company.cuaa,
    city: company.city,
  };
}

function hashBuffer(buffer: Buffer): string {
  return createHash('sha256').update(new Uint8Array(buffer)).digest('hex');
}

function hashCompanySet(companies: readonly PreclassificationCompany[]): string {
  const ids = companies.map((company) => company.id).sort();
  return createHash('sha1').update(ids.join('|')).digest('hex');
}

/**
 * Coordinates document pre-classification: loads the user's companies once,
 * reuses cached results, and enqueues a gpt-4o-mini job per uncached file.
 * Returns immediately with a preclassId the FE subscribes to (socket + poll).
 */
export class PreclassificationOrchestrator {
  constructor(private readonly companyRepository: ICompanyRepository) {}

  async start({
    files,
    itemIds,
    userId,
  }: {
    readonly files: readonly PreclassifyFileInput[];
    readonly itemIds: readonly string[];
    readonly userId: string;
  }): Promise<StartPreclassificationResponseDto> {
    const preclassId = uuid();
    const companies = (await this.companyRepository.findManyByUserId(userId)).map(toCompactCompany);
    const companySetHash = hashCompanySet(companies);
    const prepared: PreparedItem[] = files.map((file, i) => ({
      itemId: itemIds[i] ?? uuid(),
      fileIndex: i,
      fileName: file.originalname,
      file,
      fileHash: hashBuffer(file.buffer),
    }));
    const items = await this.dispatch({ preclassId, userId, companies, companySetHash, prepared });
    return { preclassId, items };
  }

  private async dispatch({
    preclassId,
    userId,
    companies,
    companySetHash,
    prepared,
  }: {
    readonly preclassId: string;
    readonly userId: string;
    readonly companies: readonly PreclassificationCompany[];
    readonly companySetHash: string;
    readonly prepared: readonly PreparedItem[];
  }): Promise<StartPreclassificationItemDto[]> {
    try {
      await seedPreclassification({
        preclassId,
        userId,
        items: prepared.map((item) => ({ itemId: item.itemId, fileName: item.fileName })),
      });
      const statuses = await Promise.all(
        prepared.map((item) =>
          this.resolveItem({ preclassId, userId, companies, companySetHash, item }),
        ),
      );
      return prepared.map((item, i) => ({
        itemId: item.itemId,
        fileIndex: item.fileIndex,
        fileName: item.fileName,
        status: statuses[i],
      }));
    } catch (error) {
      console.error('[PRECLASSIFY] dispatch failed (best-effort):', error);
      return prepared.map((item) => ({
        itemId: item.itemId,
        fileIndex: item.fileIndex,
        fileName: item.fileName,
        status: 'pending' as const,
      }));
    }
  }

  private async resolveItem({
    preclassId,
    userId,
    companies,
    companySetHash,
    item,
  }: {
    readonly preclassId: string;
    readonly userId: string;
    readonly companies: readonly PreclassificationCompany[];
    readonly companySetHash: string;
    readonly item: PreparedItem;
  }): Promise<PreclassificationItemStatus> {
    const cached = await getCachedResult({ fileHash: item.fileHash, companySetHash });
    if (cached) {
      await setItemResult({
        preclassId,
        itemId: item.itemId,
        fileName: item.fileName,
        result: cached,
      });
      return 'classified';
    }
    void getPreclassificationQueue()
      .addJob({
        preclassId,
        itemId: item.itemId,
        fileName: item.fileName,
        mimeType: item.file.mimetype,
        userId,
        fileHash: item.fileHash,
        companySetHash,
        companies,
        fileBuffer: item.file.buffer,
      })
      .catch((err) => console.error('[PRECLASSIFY] enqueue failed:', err));
    return 'pending';
  }
}
