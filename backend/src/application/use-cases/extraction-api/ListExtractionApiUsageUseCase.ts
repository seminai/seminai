import type { ExtractionApiUsageEntry } from '../../../domain/dtos/extraction-api.dto';
import type { IExtractionApiUsageLogRepository } from '../../../domain/repositories/IExtractionApiUsageLogRepository';

interface ListExtractionApiUsageDTO {
  readonly userId: string;
  readonly page?: number;
  readonly pageSize?: number;
}

export class ListExtractionApiUsageUseCase {
  constructor(private readonly usageRepository: IExtractionApiUsageLogRepository) {}

  async execute(input: ListExtractionApiUsageDTO): Promise<{
    readonly items: ReadonlyArray<ExtractionApiUsageEntry>;
    readonly total: number;
    readonly page: number;
    readonly pageSize: number;
  }> {
    const page = Math.max(input.page ?? 1, 1);
    const pageSize = Math.min(Math.max(input.pageSize ?? 20, 1), 100);
    const result = await this.usageRepository.listByUser({
      userId: input.userId,
      page,
      pageSize,
    });
    return {
      page,
      pageSize,
      total: result.total,
      items: result.items.map((item) => ({
        id: item.id,
        documentType: item.documentType,
        detectedType: item.detectedType,
        fileName: item.fileName,
        pagesProcessed: item.pagesProcessed,
        pagesCharged: item.pagesCharged,
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }
}
