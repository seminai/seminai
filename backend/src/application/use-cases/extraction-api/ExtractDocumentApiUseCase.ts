import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { LlmJobType } from '@prisma/client';
import type { DdtEntry } from '../../../domain/dtos/ddt-entry.dto';
import type { InvoiceEntry } from '../../../domain/dtos/invoice-entry.dto';
import type {
  ExtractDocumentApiResult,
  ExtractionApiDocumentType,
} from '../../../domain/dtos/extraction-api.dto';
import { AppError } from '../../../domain/errors/AppError';
import type { IExtractionApiAccountRepository } from '../../../domain/repositories/IExtractionApiAccountRepository';
import type { IExtractionApiUsageLogRepository } from '../../../domain/repositories/IExtractionApiUsageLogRepository';
import { ExtractDataFromDdtService } from '../../../infrastructure/services/tool/extractDataFromDDT';
import { ExtractDataFromInvoiceService } from '../../../infrastructure/services/tool/extractDataFromInvoice';
import { countDocumentPages } from '../../../infrastructure/services/extraction-api/count-document-pages';
import { getExtractionApiMargin } from '../../../infrastructure/services/extraction-api/extraction-api.config';
import { LlmUsageLogger } from '../../../infrastructure/services/llm_costs/llm-usage-logger';
import { resolveExtractionApiDocumentType } from './resolve-extraction-document-type';

interface ExtractDocumentApiDTO {
  readonly userId: string;
  readonly apiKeyId: string | null;
  readonly fileBuffer: Buffer;
  readonly fileName: string;
  readonly mimeType: string;
  readonly documentType: ExtractionApiDocumentType;
}

interface ExtractDocumentApiDependencies {
  readonly invoiceServiceFactory?: () => ExtractDataFromInvoiceService;
  readonly ddtServiceFactory?: () => ExtractDataFromDdtService;
}

export class ExtractDocumentApiUseCase {
  private readonly usageLogger = LlmUsageLogger.getInstance();

  constructor(
    private readonly accountRepository: IExtractionApiAccountRepository,
    private readonly usageLogRepository: IExtractionApiUsageLogRepository,
    private readonly dependencies: ExtractDocumentApiDependencies = {},
  ) {}

  async execute(input: ExtractDocumentApiDTO): Promise<ExtractDocumentApiResult> {
    const account = await this.accountRepository.findByUserId(input.userId);
    if (!account) {
      throw AppError.notFound(
        'Extraction API account not found',
        'EXTRACTION_API_ACCOUNT_NOT_FOUND',
      );
    }
    const pagesToCharge = await countDocumentPages({
      buffer: input.fileBuffer,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    const remaining = account.pageQuota - account.pagesUsed;
    if (remaining < pagesToCharge) {
      throw AppError.paymentRequired(
        `Insufficient page quota. Remaining: ${remaining}, required: ${pagesToCharge}`,
        'INSUFFICIENT_PAGE_QUOTA',
      );
    }
    const resolvedType = await resolveExtractionApiDocumentType({
      requestedType: input.documentType,
      fileBuffer: input.fileBuffer,
      mimeType: input.mimeType,
      fileName: input.fileName,
    });
    const tempPath = this.writeTempFile(input.fileBuffer, input.fileName);
    try {
      const entries = await this.runExtraction(resolvedType, tempPath);
      const updatedAccount = await this.accountRepository.consumePages(input.userId, pagesToCharge);
      await this.usageLogRepository.create({
        userId: input.userId,
        apiKeyId: input.apiKeyId,
        documentType: input.documentType,
        detectedType: resolvedType,
        fileName: input.fileName,
        pagesProcessed: pagesToCharge,
        pagesCharged: pagesToCharge,
      });
      await this.logInternalUsage(input.userId, pagesToCharge);
      return {
        documentType: resolvedType,
        requestedDocumentType: input.documentType,
        pagesProcessed: pagesToCharge,
        pagesCharged: pagesToCharge,
        entries,
        quota: this.accountRepository.toSummary(updatedAccount),
      };
    } finally {
      this.cleanupTempFiles(tempPath);
    }
  }

  private writeTempFile(buffer: Buffer, fileName: string): string {
    const tempPath = path.join(os.tmpdir(), `extract_api_${Date.now()}_${fileName}`);
    fs.writeFileSync(tempPath, new Uint8Array(buffer));
    return tempPath;
  }

  private cleanupTempFiles(tempPath: string): void {
    const candidates = [
      tempPath,
      tempPath.replace(/\.pdf$/i, '.flat.txt'),
      tempPath.replace(/\.pdf$/i, '_combined.txt'),
      tempPath.replace(/\.pdf$/i, '_ocr.txt'),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        fs.rmSync(candidate, { force: true });
      }
    }
  }

  private async runExtraction(
    documentType: 'invoice' | 'ddt',
    filePath: string,
  ): Promise<ReadonlyArray<InvoiceEntry | DdtEntry>> {
    if (documentType === 'invoice') {
      const service =
        this.dependencies.invoiceServiceFactory?.() ?? new ExtractDataFromInvoiceService();
      const result = await service.execute({ filePath });
      if (result.entries.length === 0) {
        throw AppError.badRequest('No invoice data could be extracted', 'NO_EXTRACTABLE_DATA');
      }
      return result.entries;
    }
    const service = this.dependencies.ddtServiceFactory?.() ?? new ExtractDataFromDdtService();
    const result = await service.execute({ pdfPath: filePath });
    if (result.entries.length === 0) {
      throw AppError.badRequest('No DDT data could be extracted', 'NO_EXTRACTABLE_DATA');
    }
    return result.entries;
  }

  private async logInternalUsage(userId: string, pages: number): Promise<void> {
    await this.usageLogger.logFromUsage(
      {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        cachedPromptTokens: 0,
      },
      {
        userId,
        jobType: LlmJobType.DOCUMENT_EXTRACTION,
        model: 'extraction-api',
        margin: getExtractionApiMargin(),
        metadata: { mistralOcrPages: pages },
      },
    );
  }
}
