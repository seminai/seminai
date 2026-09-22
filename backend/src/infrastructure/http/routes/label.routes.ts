import { Router } from 'express';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureUserRole } from '../middlewares/ensureUserRole';
import { bulkExtractRateLimiter } from '../middlewares/rateLimiter';
import { LabelController } from '../controllers/LabelController';
import { getLinkLabelSian } from '../../services/scraper/getLinkLabelSian';
import { upload } from '../../services/Multer';
import { LABEL_MODIFY_ROLES } from '../../../domain/constants/label-roles';

export const labelRouter = Router();
const controller = new LabelController();

labelRouter.get(
  '/extract',
  asyncHandler(async (req, res) => controller.extract(req, res)),
);

labelRouter.get(
  '/extract-sian',
  asyncHandler(async (req, res) => {
    const rawName = Array.isArray(req.query.name) ? req.query.name[0] : req.query.name;
    const rawRegNumber = Array.isArray(req.query.regNumber)
      ? req.query.regNumber[0]
      : req.query.regNumber;
    const rawUserId = Array.isArray(req.query.userId) ? req.query.userId[0] : req.query.userId;

    const name: string = (rawName ?? '').toString().trim();
    const regNumber: string = (rawRegNumber ?? '').toString().trim();
    const userId: string = (rawUserId ?? '').toString().trim();

    if (!name || !regNumber || !userId) {
      res.status(400).json({ message: 'Missing required query params: name, regNumber, userId' });
      return;
    }

    const result = await getLinkLabelSian({ name, regNumber, userId });
    res.json({ data: result });
  }),
);

labelRouter.post(
  '/bulk-extract',
  asyncHandler(async (req, res) => controller.bulkExtract(req, res)),
);

// Rate limit: 5 richieste/minuto per utente
labelRouter.post(
  '/bulk-pdf-label',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFiles(req, res)),
);

// Rate limit: 5 richieste/minuto per utente
labelRouter.post(
  '/bulk-pdf-label-async',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFilesAsync(req, res)),
);

// Rate limit: 5 richieste/minuto per utente
labelRouter.post(
  '/bulk-pdf-label-fertilizer-async',
  ensureAuthenticated,
  bulkExtractRateLimiter,
  upload.array('files'),
  asyncHandler(async (req, res) => controller.bulkExtractFromPdfFilesFertilizerAsync(req, res)),
);

labelRouter.get(
  '/job-status/:jobId',
  asyncHandler(async (req, res) => controller.getJobStatus(req, res)),
);

labelRouter.get(
  '/export-csv',
  asyncHandler(async (req, res) => controller.exportCsv(req, res)),
);

labelRouter.get(
  '/summary',
  asyncHandler(async (req, res) => controller.listSummary(req, res)),
);

labelRouter.get(
  '/bdf-label-detail',
  asyncHandler(async (req, res) => controller.getBdfLabelDetail(req, res)),
);

labelRouter.get(
  '/bdf-label-list',
  asyncHandler(async (req, res) => controller.listBdfLabelPairs(req, res)),
);

labelRouter.get(
  '/by-product',
  asyncHandler(async (req, res) => controller.getByProductAndRegistration(req, res)),
);

labelRouter.get(
  '/:id',
  asyncHandler(async (req, res) => controller.getById(req, res)),
);

labelRouter.put(
  '/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.update(req, res)),
);

labelRouter.post(
  '/verify-label/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.verifyLabel(req, res)),
);

labelRouter.post(
  '/update-label/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.updateLabel(req, res)),
);

labelRouter.post(
  '/extract-with-mistral/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.extractLabelWithMistral(req, res)),
);

labelRouter.post(
  '/extract-with-gpt/:id',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.extractLabelWithGpt(req, res)),
);

labelRouter.delete(
  '/bulk',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.bulkDelete(req, res)),
);

labelRouter.get(
  '/:id/history',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.getLabelHistory(req, res)),
);

labelRouter.post(
  '/rollback/:historyId',
  ensureAuthenticated,
  ensureUserRole(LABEL_MODIFY_ROLES),
  asyncHandler(async (req, res) => controller.rollbackLabel(req, res)),
);
