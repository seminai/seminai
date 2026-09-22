import { AppError } from '../../../domain/errors/AppError';
import { type ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { type FileExtractionRecord } from '../../../domain/repositories/IFileExtractionRepository';

interface AccessInput {
  readonly userId: string;
  readonly extraction: FileExtractionRecord;
}

interface BatchAccessInput {
  readonly userId: string;
  readonly extractions: readonly FileExtractionRecord[];
}

/**
 * Centralizes FileExtraction ownership checks for HTTP and use-case callers.
 */
export class ExtractionAccessGuard {
  constructor(private readonly companyRepository: ICompanyRepository) {}

  async assertCanAccess(input: AccessInput): Promise<void> {
    if (input.extraction.userId === input.userId) return;
    const allowedCompanyIds = await this.resolveAllowedCompanyIds(input.userId);
    if (allowedCompanyIds.has(input.extraction.companyId)) return;
    throw AppError.forbidden('Access denied to this extraction', 'EXTRACTION_ACCESS_DENIED');
  }

  async assertCanAccessBatch(input: BatchAccessInput): Promise<void> {
    if (input.extractions.every((record) => record.userId === input.userId)) return;
    const allowedCompanyIds = await this.resolveAllowedCompanyIds(input.userId);
    const hasForbiddenRecord = input.extractions.some(
      (record) => record.userId !== input.userId && !allowedCompanyIds.has(record.companyId),
    );
    if (!hasForbiddenRecord) return;
    throw AppError.forbidden('Access denied to this batch', 'BATCH_ACCESS_DENIED');
  }

  private async resolveAllowedCompanyIds(userId: string): Promise<ReadonlySet<string>> {
    const companies = await this.companyRepository.findManyByUserId(userId);
    return new Set(companies.map((company) => company.id));
  }
}
