import { Router } from 'express';
import { CompanyController } from '../controllers/CompanyController';
import { CompanyDeletionController } from '../controllers/CompanyDeletionController';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaRuleOnCompanyRepository } from '../../repositories/PrismaRuleOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../../repositories/PrismaCompanyOnWorkspaceRepository';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { CreateCompanyUseCase } from '../../../application/use-cases/company/CreateCompanyUseCase';
import { DeleteCompaniesWithAllDataUseCase } from '../../../application/use-cases/company/DeleteCompaniesWithAllDataUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { ensureCompanyIdsRole } from '../middlewares/ensureCompanyIdsRole';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';
import { CompanyRole } from '@prisma/client';

const companyRouter = Router();
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
const workspaceRepository = new PrismaWorkspaceRepository(prisma);
const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
const companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);
const fieldRepository = new PrismaFieldRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);

const createCompanyUseCase = new CreateCompanyUseCase(
  companyRepository,
  userOnCompanyRepository,
  workspaceRepository,
  workspaceMemberRepository,
  companyOnWorkspaceRepository,
);
const deleteCompaniesWithAllDataUseCase = new DeleteCompaniesWithAllDataUseCase(companyRepository);

const companyController = new CompanyController(
  companyRepository,
  userOnCompanyRepository,
  createCompanyUseCase,
  ruleOnCompanyRepository,
  workspaceRepository,
  workspaceMemberRepository,
  companyOnWorkspaceRepository,
  fieldRepository,
  productionUnitRepository,
);
const companyDeletionController = new CompanyDeletionController(deleteCompaniesWithAllDataUseCase);

companyRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.listForCurrentUser(req, res)),
);

companyRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.create(req, res)),
);

companyRouter.post(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.createBulk(req, res)),
);

companyRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.findById(req, res)),
);

companyRouter.put(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.updateBulk(req, res)),
);

companyRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.update(req, res)),
);

companyRouter.delete(
  '/:id',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN], 'id'),
  asyncHandler((req, res) => companyController.delete(req, res)),
);

companyRouter.delete(
  '/bulk/all',
  ensureAuthenticated,
  ensureCompanyIdsRole([CompanyRole.ADMIN]),
  asyncHandler((req, res) => companyDeletionController.deleteBulk(req, res)),
);

companyRouter.delete(
  '/:id/all',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN], 'id'),
  asyncHandler((req, res) => companyDeletionController.deleteOne(req, res)),
);

companyRouter.post(
  '/extract-from-csv',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => companyController.extractFromCsv(req, res)),
);

companyRouter.post(
  '/extract-from-visura',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => companyController.extractFromVisura(req, res)),
);

companyRouter.post(
  '/create-with-data',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.createWithData(req, res)),
);

export { companyRouter };
