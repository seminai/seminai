import { Router } from 'express';
import { PrismaProductionCycleRepository } from '../../repositories/PrismaProductionCycleRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { ProductionCycleController } from '../controllers/ProductionCycleController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ListProductionCyclesUseCase } from '../../../application/use-cases/production-cycle/ListProductionCyclesUseCase';
import { CreateProductionCycleUseCase } from '../../../application/use-cases/production-cycle/CreateProductionCycleUseCase';
import { UpdateProductionCycleUseCase } from '../../../application/use-cases/production-cycle/UpdateProductionCycleUseCase';
import { DeleteProductionCycleUseCase } from '../../../application/use-cases/production-cycle/DeleteProductionCycleUseCase';
import { prisma } from '../../repositories/Prisma';

const router = Router();
const cycleRepository = new PrismaProductionCycleRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);

const listUseCase = new ListProductionCyclesUseCase(cycleRepository, productionUnitRepository);
const createUseCase = new CreateProductionCycleUseCase(cycleRepository, productionUnitRepository);
const updateUseCase = new UpdateProductionCycleUseCase(cycleRepository, productionUnitRepository);
const deleteUseCase = new DeleteProductionCycleUseCase(cycleRepository);

const controller = new ProductionCycleController(
  listUseCase,
  createUseCase,
  updateUseCase,
  deleteUseCase,
);

router.get(
  '/:productionUnitId/cycles',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

router.post(
  '/:productionUnitId/cycles',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

router.put(
  '/:productionUnitId/cycles/:cycleId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

router.delete(
  '/:productionUnitId/cycles/:cycleId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

export { router as productionCycleRouter };
