import { type Request, type Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { PreclassificationOrchestrator } from '../../services/extraction/preclassification-orchestrator';
import { getPreclassificationStatus } from '../../services/extraction/preclassification-store';
import {
  type PreclassificationStatusItemDto,
  type StoredPreclassificationItem,
} from '../../../domain/dtos/preclassification.dto';

function parseItemIds(raw: unknown, expectedLength: number): string[] | undefined {
  if (typeof raw !== 'string' || raw.trim().length === 0) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw AppError.badRequest('Invalid itemIds JSON', 'INVALID_ITEM_IDS');
  }
  if (!Array.isArray(parsed) || !parsed.every((id) => typeof id === 'string')) {
    throw AppError.badRequest('itemIds must be a string array', 'INVALID_ITEM_IDS');
  }
  if (parsed.length !== expectedLength) {
    throw AppError.badRequest(
      `itemIds length (${parsed.length}) must match files length (${expectedLength})`,
      'ITEM_IDS_LENGTH_MISMATCH',
    );
  }
  return parsed as string[];
}

function toStatusItem(item: StoredPreclassificationItem): PreclassificationStatusItemDto {
  return {
    itemId: item.itemId,
    fileName: item.fileName,
    status: item.status,
    documentCategory: item.documentCategory,
    categoryConfidence: item.categoryConfidence,
    companyId: item.companyId,
    companyConfidence: item.companyConfidence,
    error: item.error,
  };
}

/**
 * HTTP controller for document pre-classification: starts an async run and
 * exposes a status snapshot used as the FE polling fallback.
 */
export class PreclassificationController {
  constructor(private readonly orchestrator: PreclassificationOrchestrator) {}

  async startPreclassify(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const files = request.files as Express.Multer.File[] | undefined;
    if (!files || files.length === 0) {
      throw AppError.badRequest('No files uploaded', 'NO_FILES');
    }
    const itemIds = parseItemIds(request.body.itemIds, files.length);
    const result = await this.orchestrator.start({
      files: files.map((file) => ({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
      })),
      itemIds: itemIds ?? [],
      userId: request.user.id,
    });
    return response.status(202).json({ status: 'accepted', data: result });
  }

  async getPreclassifyStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const status = await getPreclassificationStatus(request.params.preclassId);
    if (!status) {
      throw AppError.notFound('Preclassification not found', 'PRECLASSIFICATION_NOT_FOUND');
    }
    if (status.userId !== request.user.id) {
      throw AppError.forbidden(
        'Access denied to this preclassification',
        'PRECLASSIFY_ACCESS_DENIED',
      );
    }
    return response.json({
      status: 'success',
      data: {
        preclassId: request.params.preclassId,
        items: status.items.map(toStatusItem),
      },
    });
  }
}
