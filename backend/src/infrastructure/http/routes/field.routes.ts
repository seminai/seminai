import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { FieldController } from '../controllers/FieldController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { startJobRateLimiter } from '../middlewares/rateLimiter';
import { GetFieldsAvailabilityUseCase } from '../../../application/use-cases/field/GetFieldsAvailabilityUseCase';
import { DeleteFieldsBulkUseCase } from '../../../application/use-cases/field/DeleteFieldsBulkUseCase';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';

const router = Router();
const fieldRepository = new PrismaFieldRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
const getFieldsAvailabilityUseCase = new GetFieldsAvailabilityUseCase(
  fieldRepository,
  productionUnitRepository,
);
const deleteFieldsBulkUseCase = new DeleteFieldsBulkUseCase(fieldRepository);
const controller = new FieldController(
  fieldRepository,
  getFieldsAvailabilityUseCase,
  deleteFieldsBulkUseCase,
);

router.get(
  '/availability',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listAvailabilityByCompanies(req, res)),
);

// Rate limit: 10 richieste/minuto per utente
router.post(
  '/start-job-field-extraction',
  ensureAuthenticated,
  startJobRateLimiter,
  upload.single('file'),
  asyncHandler((req, res) => controller.startExtractionJob(req, res)),
);

router.get(
  '/extraction-status/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getExtractionJobStatus(req, res)),
);

router.post(
  '/extract',
  ensureAuthenticated,
  upload.any(),
  asyncHandler((req, res) => controller.extractOnly(req, res)),
);

router.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listForCurrentUser(req, res)),
);

router.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.create(req, res)),
);

router.post(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.createBulk(req, res)),
);

router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

router.get(
  '/company/:companyId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  asyncHandler((req, res) => controller.listByCompany(req, res)),
);

router.put(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.updateBulk(req, res)),
);

router.delete(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.deleteBulk(req, res)),
);

router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

export { router as fieldRouter };
