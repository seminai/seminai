import { AppError } from '../../../domain/errors/AppError';
import type { ExtractionApiAccountSummary } from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiAccountRepository } from '../../../domain/repositories/IExtractionApiAccountRepository';

interface AllocateExtractionPageQuotaDTO {
  readonly userId: string;
  readonly addPages: number;
}

export class AllocateExtractionPageQuotaUseCase {
  constructor(private readonly accountRepository: IExtractionApiAccountRepository) {}

  async execute(input: AllocateExtractionPageQuotaDTO): Promise<ExtractionApiAccountSummary> {
    if (!Number.isFinite(input.addPages) || input.addPages <= 0) {
      throw AppError.badRequest('addPages must be a positive number', 'INVALID_PAGE_QUOTA');
    }
    const account = await this.accountRepository.findByUserId(input.userId);
    if (!account) {
      throw AppError.notFound(
        'Extraction API account not found',
        'EXTRACTION_API_ACCOUNT_NOT_FOUND',
      );
    }
    const updated = await this.accountRepository.addPageQuota(input.userId, input.addPages);
    return this.accountRepository.toSummary(updated);
  }
}
