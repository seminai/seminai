import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { expireStaleRuns, getQdcSyncQueue } from '../../queue/QdcSyncQueue';
import {
  QDC_DISABLED_MESSAGE,
  getQdcClientIdForUser,
} from '../../services/agents/dosage_agent_react/tools/qdc/require-qdc';

/**
 * HTTP surface of the QDC (Quaderno di Campagna) mirror sync: manual trigger
 * ("Sincronizza ora") + last-run status for the FE integrations panel.
 * The actual sync executes in the worker process via QdcSyncQueue.
 */
export class QdcController {
  /**
   * POST /qdc/sync — enqueues a manual sync run.
   * 202 with the created syncRunId; 409 when a run is already in progress;
   * 400 when no QDC client id is resolvable.
   */
  async startSync(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const clientId = await getQdcClientIdForUser(request.user.id);
    if (!clientId) {
      throw AppError.badRequest(QDC_DISABLED_MESSAGE, 'QDC_NOT_CONFIGURED');
    }
    await expireStaleRuns();
    const runningRun = await prisma.qdcSyncRun.findFirst({ where: { status: 'running' } });
    if (runningRun) {
      return response.status(409).json({
        status: 'error',
        code: 'SYNC_ALREADY_RUNNING',
        data: { syncRunId: runningRun.id },
      });
    }
    const syncRun = await prisma.qdcSyncRun.create({
      data: { trigger: 'manual', status: 'running' },
    });
    await getQdcSyncQueue().addManualJob({ syncRunId: syncRun.id, userId: request.user.id });
    return response.status(202).json({
      status: 'success',
      data: { syncRunId: syncRun.id },
    });
  }

  /**
   * GET /qdc/sync/status — last sync run (any trigger) + mirrored aziende count.
   */
  async getSyncStatus(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const run = await prisma.qdcSyncRun.findFirst({ orderBy: { startedAt: 'desc' } });
    const aziendaCount = await prisma.qdcAzienda.count();
    return response.json({
      status: 'success',
      data: {
        run: run
          ? {
              id: run.id,
              trigger: run.trigger,
              status: run.status,
              startedAt: run.startedAt.toISOString(),
              finishedAt: run.finishedAt?.toISOString() ?? null,
              counters: run.counters,
              error: run.error,
            }
          : null,
        aziendaCount,
      },
    });
  }
}
