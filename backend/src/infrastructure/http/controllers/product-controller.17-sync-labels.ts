import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { getProductLabelMatchingQueue } from '../../queue/ProductLabelMatchingQueue';
import { isStaleSummary } from '../../../application/use-cases/product/buildProductLabelSummary';
import { SyncProductLabelsRequest, SyncProductLabelsResponse } from '../../../domain/dtos/product.dto';
import type { ProductControllerContext } from './product-controller.context';

export async function productControllerSyncLabels(this: ProductControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    if (!this.prisma) {
      throw AppError.internal('Database connection not available', 'DB_NOT_AVAILABLE');
    }
    const body = (request.body ?? {}) as SyncProductLabelsRequest;
    if (
      !body.companyId &&
      !body.warehouseId &&
      (!body.productIds || body.productIds.length === 0)
    ) {
      throw AppError.badRequest(
        'At least one of companyId, warehouseId or productIds must be provided',
        'MISSING_SYNC_FILTER',
      );
    }
    const candidates = await this.findSyncCandidates(request.user.id, body);
    const eligibleIds = body.forceRefresh
      ? candidates.map((c) => c.id)
      : candidates.filter((c) => isStaleSummary(c.labelMetadata)).map((c) => c.id);
    if (eligibleIds.length === 0) {
      const payload: SyncProductLabelsResponse = { jobId: null, queued: 0 };
      return response.json({ status: 'success', data: payload });
    }
    const jobId = await getProductLabelMatchingQueue().addJob({
      productIds: eligibleIds,
      forceRefresh: body.forceRefresh === true,
    });
    const payload: SyncProductLabelsResponse = { jobId, queued: eligibleIds.length };
    return response.json({ status: 'success', data: payload });
  }
