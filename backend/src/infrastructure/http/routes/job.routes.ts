import { Router } from 'express';
import { PrismaJobRepository } from '../../repositories/PrismaJobRepository';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { JobController } from '../controllers/JobController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaProductRepository } from '../../repositories/PrismaProductRepository';
import { PrismaWarehouseRepository } from '../../repositories/PrismaWarehouseRepository';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const router = Router();
const jobRepository = new PrismaJobRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const userRepository = new PrismaUserRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);
const fieldRepository = new PrismaFieldRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const productRepository = new PrismaProductRepository(prisma);
const warehouseRepository = new PrismaWarehouseRepository(prisma);
const accessGuard = createResourceAccessGuard(prisma);
const controller = new JobController(
  jobRepository,
  stockRepository,
  accessGuard,
  userRepository,
  productionUnitRepository,
  fieldRepository,
  userOnCompanyRepository,
  productRepository,
  warehouseRepository,
);

router.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

router.post(
  '/create-product-and-job',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.bulkCreateProductAndJob(req, res)),
);

router.get(
  '/create-product-and-job/status/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getProductJobCreationStatus(req, res)),
);

router.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listForCurrentUser(req, res)),
);

router.get(
  '/me/verified',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listVerifiedForCurrentUser(req, res)),
);

router.get(
  '/get-job-grouped-by-job-id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listGroupedByJobId(req, res)),
);

router.get(
  '/groups-summary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listJobGroupsSummary(req, res)),
);

router.get(
  '/group/:jobId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByGroupJobId(req, res)),
);

router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

router.get(
  '/production-unit/:productionUnitId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByProductionUnit(req, res)),
);

router.put(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.bulkUpdate(req, res)),
);

router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

router.delete(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.bulkDelete(req, res)),
);

router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

router.patch(
  '/:id/assign-user',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.assignUser(req, res)),
);

export { router as jobRouter };
