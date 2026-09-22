export interface CreateExtractionApiUsageLogInput {
  readonly userId: string;
  readonly apiKeyId: string | null;
  readonly documentType: string;
  readonly detectedType: string | null;
  readonly fileName: string | null;
  readonly pagesProcessed: number;
  readonly pagesCharged: number;
}

export interface ExtractionApiUsageLogRecord {
  readonly id: string;
  readonly userId: string;
  readonly apiKeyId: string | null;
  readonly documentType: string;
  readonly detectedType: string | null;
  readonly fileName: string | null;
  readonly pagesProcessed: number;
  readonly pagesCharged: number;
  readonly createdAt: Date;
}

export interface ListExtractionApiUsageParams {
  readonly userId: string;
  readonly page: number;
  readonly pageSize: number;
}

export interface IExtractionApiUsageLogRepository {
  create(input: CreateExtractionApiUsageLogInput): Promise<ExtractionApiUsageLogRecord>;
  listByUser(params: ListExtractionApiUsageParams): Promise<{
    readonly items: ReadonlyArray<ExtractionApiUsageLogRecord>;
    readonly total: number;
  }>;
}
