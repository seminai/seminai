import { Router } from 'express';
import { DosageAgentController } from '../controllers/DosageAgentController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { startJobRateLimiter } from '../middlewares/rateLimiter';

const dosageAgentRouter = Router();
const controller = new DosageAgentController();

// POST /dosage-agent/run (sincrono - legacy)
dosageAgentRouter.post('/run', asyncHandler(controller.run.bind(controller)));

// POST /dosage-agent/plan-dosage (sincrono - legacy)
dosageAgentRouter.post('/plan-dosage', asyncHandler(controller.plan.bind(controller)));

// POST /dosage-agent/start-job (asincrono)
// Rate limit: 10 richieste/minuto per utente
dosageAgentRouter.post(
  '/start-job',
  ensureAuthenticated,
  startJobRateLimiter,
  asyncHandler(controller.startJob.bind(controller)),
);

// GET /dosage-agent/jobs (storico per utente)
dosageAgentRouter.get(
  '/jobs',
  ensureAuthenticated,
  asyncHandler(controller.listJobs.bind(controller)),
);

// GET /dosage-agent/jobs/:jobId (dal DB)
dosageAgentRouter.get(
  '/jobs/:jobId',
  ensureAuthenticated,
  asyncHandler(controller.getStoredJob.bind(controller)),
);

// DELETE /dosage-agent/jobs/:jobId
dosageAgentRouter.delete(
  '/jobs/:jobId',
  ensureAuthenticated,
  asyncHandler(controller.deleteJob.bind(controller)),
);

// GET /dosage-agent/job-status/:jobId
dosageAgentRouter.get(
  '/job-status/:jobId',
  ensureAuthenticated,
  asyncHandler(controller.getJobStatus.bind(controller)),
);

export { dosageAgentRouter };
