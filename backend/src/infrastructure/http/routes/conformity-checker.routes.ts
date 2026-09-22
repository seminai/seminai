import { Router } from 'express';
import { ConformityCheckerController } from '../controllers/ConformityCheckerController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { startJobRateLimiter } from '../middlewares/rateLimiter';

const conformityCheckerRouter = Router();
const controller = new ConformityCheckerController();

/**
 * POST /conformity-checker/start-job
 * Avvia un job di controllo conformità in modo asincrono
 * Rate limit: 10 richieste/minuto per utente
 *
 * Body:
 * {
 *   "jobGroupId": "uuid-del-gruppo-job",
 *   "notes": "Note agronomiche opzionali dell'utente"
 * }
 *
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "jobId": "uuid-del-job-creato",
 *     "message": "..."
 *   }
 * }
 */
conformityCheckerRouter.post(
  '/start-job',
  ensureAuthenticated,
  startJobRateLimiter,
  asyncHandler(controller.startJob.bind(controller)),
);

/**
 * GET /conformity-checker/job-status/:jobId
 * Ottiene lo stato di un job di controllo conformità
 *
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "id": "...",
 *     "state": "completed",
 *     "progress": 100,
 *     "result": { ... } // ConformityCheckOutput
 *   }
 * }
 */
conformityCheckerRouter.get(
  '/job-status/:jobId',
  ensureAuthenticated,
  asyncHandler(controller.getJobStatus.bind(controller)),
);

/**
 * POST /conformity-checker/confirm
 * Conferma e applica le proposte di conformità ai job esistenti
 *
 * Body:
 * {
 *   "jobGroupId": "uuid-del-gruppo-job",
 *   "jobIds": ["uuid-1", "uuid-2"], // opzionale
 *   "proposals": [...] // le proposte dal risultato del check
 * }
 *
 * Response:
 * {
 *   "status": "success",
 *   "data": {
 *     "jobGroupId": "...",
 *     "updatedJobsCount": 5,
 *     "excludedJobsCount": 1,
 *     "updatedJobIds": ["...", "..."]
 *   }
 * }
 */
conformityCheckerRouter.post(
  '/confirm',
  ensureAuthenticated,
  asyncHandler(controller.confirm.bind(controller)),
);

/**
 * DELETE /conformity-checker/jobs/:jobId
 * Cancella un job dalla coda
 *
 * Query params:
 * - force=true: forza la cancellazione anche se il job è in esecuzione
 */
conformityCheckerRouter.delete(
  '/jobs/:jobId',
  ensureAuthenticated,
  asyncHandler(controller.deleteJob.bind(controller)),
);

export { conformityCheckerRouter };
