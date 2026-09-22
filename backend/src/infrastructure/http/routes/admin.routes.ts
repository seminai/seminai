import { Router, type Request, type Response } from 'express';
import { prisma } from '../../repositories/Prisma';
import { PrismaAdminRepository } from '../../repositories/PrismaAdminRepository';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAdminAccess, ensureAdminWhitelist } from '../middlewares/ensureAdminAccess';
import { GetAdminDashboardSummaryUseCase } from '../../../application/use-cases/admin/GetAdminDashboardSummaryUseCase';
import { SetUserBlockedStatusUseCase } from '../../../application/use-cases/admin/SetUserBlockedStatusUseCase';
import { DeactivateUserUseCase } from '../../../application/use-cases/admin/DeactivateUserUseCase';
import { ReactivateUserUseCase } from '../../../application/use-cases/admin/ReactivateUserUseCase';
import { ExportInvoiceExtractionDatasetUseCase } from '../../../application/use-cases/extraction/ExportInvoiceExtractionDatasetUseCase';
import { AllocateExtractionPageQuotaUseCase } from '../../../application/use-cases/extraction-api/AllocateExtractionPageQuotaUseCase';
import { PrismaFileExtractionEditLogRepository } from '../../repositories/PrismaFileExtractionEditLogRepository';
import { PrismaExtractionApiAccountRepository } from '../../repositories/PrismaExtractionApiAccountRepository';
import { AdminController } from '../controllers/AdminController';
import { getCachedAgentApp } from '../../services/agents/dosage_agent_react';
import { getThreadHistory } from '../../services/agents/dosage_agent_react/persistence/thread-history.service';

const adminRouter = Router();
const adminRepository = new PrismaAdminRepository(prisma);
const userRepository = new PrismaUserRepository(prisma);
const adminController = new AdminController(
  new GetAdminDashboardSummaryUseCase(adminRepository),
  new SetUserBlockedStatusUseCase(userRepository),
  new DeactivateUserUseCase(userRepository),
  new ReactivateUserUseCase(userRepository),
);

adminRouter.get(
  '/access-status',
  ensureAuthenticated,
  ensureAdminWhitelist,
  asyncHandler((request, response) => adminController.getAccessStatus(request, response)),
);

adminRouter.post(
  '/unlock',
  ensureAuthenticated,
  ensureAdminWhitelist,
  asyncHandler((request, response) => adminController.unlockAccess(request, response)),
);

adminRouter.get(
  '/data-totals',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler((request, response) => adminController.getDashboardSummary(request, response)),
);

adminRouter.patch(
  '/users/:userId/block',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler((request, response) => adminController.updateBlockedStatus(request, response)),
);

adminRouter.post(
  '/users/:userId/deactivate',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler((request, response) => adminController.deactivateUser(request, response)),
);

adminRouter.post(
  '/users/:userId/reactivate',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler((request, response) => adminController.reactivateUser(request, response)),
);

const extractionApiAccountRepository = new PrismaExtractionApiAccountRepository(prisma);
const allocatePageQuotaUseCase = new AllocateExtractionPageQuotaUseCase(
  extractionApiAccountRepository,
);

adminRouter.patch(
  '/extraction-api/users/:userId/quota',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler(async (request, response) => {
    const userId = String(request.params.userId ?? '');
    const addPages = Number((request.body as { addPages?: number })?.addPages);
    const account = await allocatePageQuotaUseCase.execute({ userId, addPages });
    return response.json({ status: 'success', data: { account } });
  }),
);

// ── Invoice/DDT edit dataset export ──

const exportInvoiceDatasetUseCase = new ExportInvoiceExtractionDatasetUseCase(
  new PrismaFileExtractionEditLogRepository(),
);

adminRouter.get(
  '/datasets/invoice-edits.yaml',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const since = parseDate(req.query.since);
    const until = parseDate(req.query.until);
    const companyId = typeof req.query.companyId === 'string' ? req.query.companyId : undefined;
    const result = await exportInvoiceDatasetUseCase.execute({ since, until, companyId });
    res.setHeader('Content-Type', 'application/x-yaml; charset=utf-8');
    res.setHeader('X-Dataset-Entry-Count', String(result.entryCount));
    return res.status(200).send(result.yaml);
  }),
);

function parseDate(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

// ── Agent debug endpoints ──

adminRouter.get(
  '/agent/threads/:threadId/history',
  ensureAuthenticated,
  ensureAdminAccess,
  asyncHandler(async (req: Request, res: Response) => {
    const { threadId } = req.params;
    if (!threadId) {
      return res.status(400).json({ status: 'error', message: 'threadId is required' });
    }

    const app = getCachedAgentApp(threadId);
    if (!app) {
      return res.status(404).json({
        status: 'error',
        message: `No active agent found for thread ${threadId}. The agent may have been evicted from cache.`,
      });
    }

    const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;
    const history = await getThreadHistory({ app, threadId, limit });
    return res.json({ status: 'success', data: history });
  }),
);

export { adminRouter };
