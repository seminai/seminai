import type { ExtractionApiAccountSummary } from '../dtos/extraction-api.dto';

export interface ExtractionApiAccountRecord {
  readonly id: string;
  readonly userId: string;
  readonly pageQuota: number;
  readonly pagesUsed: number;
}

export interface IExtractionApiAccountRepository {
  createForUser(userId: string, pageQuota: number): Promise<ExtractionApiAccountRecord>;
  findByUserId(userId: string): Promise<ExtractionApiAccountRecord | null>;
  addPageQuota(userId: string, addPages: number): Promise<ExtractionApiAccountRecord>;
  consumePages(userId: string, pages: number): Promise<ExtractionApiAccountRecord>;
  toSummary(record: ExtractionApiAccountRecord): ExtractionApiAccountSummary;
}
