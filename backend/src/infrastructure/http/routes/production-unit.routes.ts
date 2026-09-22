import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { ProductionUnitController } from '../controllers/ProductionUnitController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { CreateProductionUnitUseCase } from '../../../application/use-cases/production-unit/CreateProductionUnitUseCase';
import { CreateProductionUnitsBulkUseCase } from '../../../application/use-cases/production-unit/CreateProductionUnitsBulkUseCase';
import { UpdateProductionUnitUseCase } from '../../../application/use-cases/production-unit/UpdateProductionUnitUseCase';
import { DeleteProductionUnitUseCase } from '../../../application/use-cases/production-unit/DeleteProductionUnitUseCase';
import { DeleteProductionUnitsBulkUseCase } from '../../../application/use-cases/production-unit/DeleteProductionUnitsBulkUseCase';
import { ListProductionUnitsByUserUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByUserUseCase';
import { ListProductionUnitsByCropUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByCropUseCase';
import { ListProductionUnitsByCompaniesUseCase } from '../../../application/use-cases/production-unit/ListProductionUnitsByCompaniesUseCase';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { BulkImportController } from '../controllers/BulkImportController';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const router = Router();
const repository = new PrismaProductionUnitRepository(prisma);
const fieldRepository = new PrismaFieldRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const createUseCase = new CreateProductionUnitUseCase(repository, fieldRepository);
const createBulkUseCase = new CreateProductionUnitsBulkUseCase(repository, fieldRepository);
const updateUseCase = new UpdateProductionUnitUseCase(repository, fieldRepository);
const deleteUseCase = new DeleteProductionUnitUseCase(repository);
const deleteBulkUseCase = new DeleteProductionUnitsBulkUseCase(repository);
const listByUserUseCase = new ListProductionUnitsByUserUseCase(repository);
const listByCropUseCase = new ListProductionUnitsByCropUseCase(repository);
const listByCompaniesUseCase = new ListProductionUnitsByCompaniesUseCase(
  repository,
  userOnCompanyRepository,
);
const bulkImportUseCase = new BulkImportFieldsAndProductionUnitsUseCase(
  fieldRepository,
  repository,
  companyRepository,
);
const controller = new ProductionUnitController(
  repository,
  fieldRepository,
  createUseCase,
  createBulkUseCase,
  updateUseCase,
  deleteUseCase,
  deleteBulkUseCase,
  listByUserUseCase,
  listByCropUseCase,
  listByCompaniesUseCase,
  createResourceAccessGuard(prisma),
);
const bulkImportController = new BulkImportController(bulkImportUseCase);

router.post(
  '/extract',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  upload.single('file'),
  asyncHandler((req, res) => controller.extractFromFile(req, res)),
);

router.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByUser(req, res)),
);

router.get(
  '/get-production-unit-by-crop',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByCrop(req, res)),
);

router.post(
  '/get-production-unit-by-companies',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByCompanies(req, res)),
);

router.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'fieldId'),
  asyncHandler((req, res) => controller.create(req, res)),
);

router.post(
  '/bulk/create',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.createBulk(req, res)),
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

router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

router.get(
  '/field/:fieldId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'fieldId'),
  asyncHandler((req, res) => controller.listByField(req, res)),
);

router.post(
  '/bulk-import',
  ensureAuthenticated,
  asyncHandler((req, res) => bulkImportController.bulkImportFieldsAndProductionUnits(req, res)),
);

export { router as productionUnitRouter };
