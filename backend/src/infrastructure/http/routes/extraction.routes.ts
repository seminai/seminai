import { Router } from 'express';
import { prisma } from '../../repositories/Prisma';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaFileRepository } from '../../repositories/PrismaFileRepository';
import { PrismaProductRepository } from '../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { PrismaFileExtractionRepository } from '../../repositories/PrismaFileExtractionRepository';
import { PrismaFileExtractionEditLogRepository } from '../../repositories/PrismaFileExtractionEditLogRepository';
import { PrismaJobRepository } from '../../repositories/PrismaJobRepository';
import { ListFileExtractionsUseCase } from '../../../application/use-cases/extraction/ListFileExtractionsUseCase';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { CreateOrUpdateProductsAndStocksBulkUseCase } from '../../../application/use-cases/product/CreateOrUpdateProductsAndStocksBulkUseCase';
import { BatchExtractionOrchestrator } from '../../services/extraction/batch-extraction-orchestrator';
import { ExtractionConfirmer } from '../../services/extraction/extraction-confirmer';
import { FileExtractionController } from '../controllers/FileExtractionController';
import { PreclassificationController } from '../controllers/PreclassificationController';
import { PreclassificationOrchestrator } from '../../services/extraction/preclassification-orchestrator';
import { ListExtractionCategorySummaryUseCase } from '../../../application/use-cases/extraction/ListExtractionCategorySummaryUseCase';
import { LogFileExtractionEditUseCase } from '../../../application/use-cases/extraction/LogFileExtractionEditUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { CompanyRole } from '@prisma/client';

// Repositories
const fieldRepository = new PrismaFieldRepository(prisma);
const fileRepository = new PrismaFileRepository(prisma);
const fileExtractionRepository = new PrismaFileExtractionRepository();
const fileExtractionEditLogRepository = new PrismaFileExtractionEditLogRepository();
const productRepository = new PrismaProductRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
const jobRepository = new PrismaJobRepository(prisma);

// Use cases
const bulkImportUseCase = new BulkImportFieldsAndProductionUnitsUseCase(
  fieldRepository,
  productionUnitRepository,
  companyRepository,
);
const productStockUseCase = new CreateOrUpdateProductsAndStocksBulkUseCase(
  productRepository,
  stockRepository,
  warehouseRepository,
);
const logEditUseCase = new LogFileExtractionEditUseCase(fileExtractionEditLogRepository);

// Services
const orchestrator = new BatchExtractionOrchestrator(
  fieldRepository,
  fileExtractionRepository,
  fileRepository,
  logEditUseCase,
);
const confirmer = new ExtractionConfirmer(
  fileExtractionRepository,
  companyRepository,
  bulkImportUseCase,
  productStockUseCase,
  logEditUseCase,
);
const listFileExtractionsUseCase = new ListFileExtractionsUseCase(
  fileExtractionRepository,
  companyRepository,
  jobRepository,
);
const listExtractionCategorySummaryUseCase = new ListExtractionCategorySummaryUseCase(
  fileExtractionRepository,
  companyRepository,
);

// Controller
const controller = new FileExtractionController(
  orchestrator,
  confirmer,
  fileExtractionRepository,
  companyRepository,
  listFileExtractionsUseCase,
  listExtractionCategorySummaryUseCase,
  logEditUseCase,
  fileExtractionEditLogRepository,
);

const preclassificationController = new PreclassificationController(
  new PreclassificationOrchestrator(companyRepository),
);

export const extractionRouter = Router();

// POST /preclassify — auto-detect company + category for files BEFORE upload (no companyId needed)
extractionRouter.post(
  '/preclassify',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler((req, res) => preclassificationController.startPreclassify(req, res)),
);

// GET /preclassify/:preclassId/status — preclassification status snapshot (FE polling fallback)
extractionRouter.get(
  '/preclassify/:preclassId/status',
  ensureAuthenticated,
  asyncHandler((req, res) => preclassificationController.getPreclassifyStatus(req, res)),
);

// POST /batch — upload files and start extractions (Multer BEFORE ensureCompanyRole)
extractionRouter.post(
  '/batch',
  ensureAuthenticated,
  upload.array('files', 10),
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.startBatch(req, res)),
);

// POST /batch/:batchId/confirm — confirm all extractions in a batch
extractionRouter.post(
  '/batch/:batchId/confirm',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.confirmBatch(req, res)),
);

// GET /batch/:batchId/status — lightweight status snapshot (FE polling fallback)
extractionRouter.get(
  '/batch/:batchId/status',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getBatchStatus(req, res)),
);

// GET / — list extractions by companyId
extractionRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

// GET /filter-options — distinct values for column filters
extractionRouter.get(
  '/filter-options',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.filterOptions(req, res)),
);

// GET /category-summary — list extraction categories by company
extractionRouter.get(
  '/category-summary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listCategorySummary(req, res)),
);

// GET /:id — single extraction detail
extractionRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getById(req, res)),
);

// PATCH /:id — edit extracted data
extractionRouter.patch(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

// GET /:id/edit-history — full before/after log of edits applied to extractedData
extractionRouter.get(
  '/:id/edit-history',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getEditHistory(req, res)),
);

// POST /:id/confirm — confirm single extraction
extractionRouter.post(
  '/:id/confirm',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.confirm(req, res)),
);

// DELETE /:id — delete extraction
extractionRouter.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.remove(req, res)),
);
