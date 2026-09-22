import { Request, Response } from 'express';
import { getDisciplinariFromBDF } from '../../services/tool/getDisciplinariFromBDF';
import { prisma } from '../../repositories/Prisma';
import {
  ExtractDataFromBrogliaccioService,
  BrogliaccioExtractionResult,
} from '../../services/tool/extractDataFromBrogliaccio';
import { MulterFile } from '../../services/Multer';

const BROGLIACCIO_EXTRACTION_CONCURRENCY = 2;

type BrogliaccioFileExtractionResult =
  | ({ readonly fileName: string; readonly status: 'extracted' } & BrogliaccioExtractionResult)
  | {
      readonly fileName: string;
      readonly status: 'failed';
      readonly error: string;
      readonly rawEntries: [];
      readonly payload: [];
    };

function chunkFiles(files: readonly MulterFile[]): readonly MulterFile[][] {
  const chunks: MulterFile[][] = [];
  for (let index = 0; index < files.length; index += BROGLIACCIO_EXTRACTION_CONCURRENCY) {
    chunks.push(files.slice(index, index + BROGLIACCIO_EXTRACTION_CONCURRENCY));
  }
  return chunks;
}

async function extractSingleBrogliaccioFile({
  file,
  service,
}: {
  readonly file: MulterFile;
  readonly service: ExtractDataFromBrogliaccioService;
}): Promise<BrogliaccioFileExtractionResult> {
  try {
    const result = await service.execute({
      imageBuffer: file.buffer,
      fileName: file.originalname,
    });
    return { fileName: file.originalname, status: 'extracted', ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[BROGLIACCIO_EXTRACTION] Failed to extract ${file.originalname}: ${message}`);
    return {
      fileName: file.originalname,
      status: 'failed',
      error: message,
      rawEntries: [],
      payload: [],
    };
  }
}

async function extractBrogliaccioFiles({
  files,
  service,
}: {
  readonly files: readonly MulterFile[];
  readonly service: ExtractDataFromBrogliaccioService;
}): Promise<readonly BrogliaccioFileExtractionResult[]> {
  const results: BrogliaccioFileExtractionResult[] = [];
  for (const chunk of chunkFiles(files)) {
    const chunkResults = await Promise.all(
      chunk.map((file) => extractSingleBrogliaccioFile({ file, service })),
    );
    results.push(...chunkResults);
  }
  return results;
}

export class ToolController {
  async getDisciplinariFromBdf(request: Request, response: Response): Promise<Response> {
    const { name, reg, datasetPath } = request.query;
    if (typeof name !== 'string' || !name.trim()) {
      return response.status(400).json({
        status: 'error',
        message: 'Query parameter "name" is required',
      });
    }
    if (typeof reg !== 'string' || !reg.trim()) {
      return response.status(400).json({
        status: 'error',
        message: 'Query parameter "reg" is required',
      });
    }
    const disciplinari = await getDisciplinariFromBDF({
      productName: name,
      registrationNumber: reg,
      datasetPath: typeof datasetPath === 'string' ? datasetPath : undefined,
    });
    return response.status(200).json({
      status: 'success',
      data: disciplinari,
    });
  }

  async getTokenCosts(request: Request, response: Response): Promise<Response> {
    const userId = request.user?.id;
    if (!userId) {
      return response.status(401).json({ status: 'error', message: 'Unauthorized' });
    }
    const usages = await prisma.llmUsage.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    const sanitized = usages.map((usage) => ({
      id: usage.id,
      userId: usage.userId,
      companyId: usage.companyId,
      jobId: usage.jobId,
      jobGroupId: usage.jobGroupId,
      jobType: usage.jobType,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      costClient: usage.costClient,
      metadata: usage.metadata,
      createdAt: usage.createdAt,
      updatedAt: usage.updatedAt,
    }));
    const totals = sanitized.reduce(
      (acc, usage) => ({
        totalCostClient: acc.totalCostClient + usage.costClient,
        totalPromptTokens: acc.totalPromptTokens + usage.promptTokens,
        totalCompletionTokens: acc.totalCompletionTokens + usage.completionTokens,
        totalTokens: acc.totalTokens + usage.totalTokens,
      }),
      {
        totalCostClient: 0,
        totalPromptTokens: 0,
        totalCompletionTokens: 0,
        totalTokens: 0,
      },
    );
    return response.status(200).json({
      status: 'success',
      data: {
        usages: sanitized,
        totals,
      },
    });
  }

  async extractDataFromBrogliacci(request: Request, response: Response): Promise<Response> {
    const files = request.files as MulterFile[];
    if (!files || files.length === 0) {
      return response.status(400).json({
        status: 'error',
        message: 'No files uploaded. Send images via multipart/form-data with field name "files".',
      });
    }

    const results = await extractBrogliaccioFiles({
      files,
      service: new ExtractDataFromBrogliaccioService(),
    });
    return response.status(200).json({ status: 'success', data: { results } });
  }
}
