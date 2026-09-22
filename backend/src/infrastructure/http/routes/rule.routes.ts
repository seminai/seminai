import { Router } from 'express';
import { RuleController } from '../controllers/RuleController';
import { RuleMarketplaceController } from '../controllers/RuleMarketplaceController';
import { PrismaRuleRepository } from '../../repositories/PrismaRuleRepository';
import { PrismaRuleMarketplaceRepository } from '../../repositories/PrismaRuleMarketplaceRepository';
import { PrismaRuleOnCompanyRepository } from '../../repositories/PrismaRuleOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { CreateRuleUseCase } from '../../../application/use-cases/rule/CreateRuleUseCase';
import { GetRuleUseCase } from '../../../application/use-cases/rule/GetRuleUseCase';
import { ListRulesUseCase } from '../../../application/use-cases/rule/ListRulesUseCase';
import { UpdateRuleUseCase } from '../../../application/use-cases/rule/UpdateRuleUseCase';
import { DeleteRuleUseCase } from '../../../application/use-cases/rule/DeleteRuleUseCase';
import { AssignRuleToCompanyUseCase } from '../../../application/use-cases/rule/AssignRuleToCompanyUseCase';
import { UnassignRuleFromCompanyUseCase } from '../../../application/use-cases/rule/UnassignRuleFromCompanyUseCase';
import { ListCompanyRulesUseCase } from '../../../application/use-cases/rule/ListCompanyRulesUseCase';
import { ListRuleCompaniesUseCase } from '../../../application/use-cases/rule/ListRuleCompaniesUseCase';
import { RetryRuleVectorizationUseCase } from '../../../application/use-cases/rule/RetryRuleVectorizationUseCase';
import { GetRuleChunksUseCase } from '../../../application/use-cases/rule/GetRuleChunksUseCase';
import { CreateRuleFromPublicUseCase } from '../../../application/use-cases/rule/CreateRuleFromPublicUseCase';
import { ListRuleMarketplaceUseCase } from '../../../application/use-cases/rule/ListRuleMarketplaceUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';
import { upload } from '../../services/Multer';

const ruleRouter = Router();

// Repositories
const ruleRepository = new PrismaRuleRepository(prisma);
const ruleMarketplaceRepository = new PrismaRuleMarketplaceRepository(prisma);
const ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
const workspaceRepository = new PrismaWorkspaceRepository(prisma);
const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);

// Use Cases
const createRuleUseCase = new CreateRuleUseCase(
  ruleRepository,
  workspaceRepository,
  workspaceMemberRepository,
);
const getRuleUseCase = new GetRuleUseCase(ruleRepository, workspaceMemberRepository);
const listRulesUseCase = new ListRulesUseCase(ruleRepository, workspaceMemberRepository);
const updateRuleUseCase = new UpdateRuleUseCase(ruleRepository, workspaceMemberRepository);
const deleteRuleUseCase = new DeleteRuleUseCase(ruleRepository, workspaceMemberRepository);
const assignRuleToCompanyUseCase = new AssignRuleToCompanyUseCase(
  ruleRepository,
  ruleOnCompanyRepository,
  workspaceRepository,
  workspaceMemberRepository,
  companyRepository,
);
const unassignRuleFromCompanyUseCase = new UnassignRuleFromCompanyUseCase(
  ruleRepository,
  ruleOnCompanyRepository,
  workspaceMemberRepository,
  companyRepository,
);
const listCompanyRulesUseCase = new ListCompanyRulesUseCase(
  ruleRepository,
  ruleOnCompanyRepository,
  companyRepository,
);
const listRuleCompaniesUseCase = new ListRuleCompaniesUseCase(
  ruleRepository,
  ruleOnCompanyRepository,
  workspaceMemberRepository,
  companyRepository,
);
const retryRuleVectorizationUseCase = new RetryRuleVectorizationUseCase(
  ruleRepository,
  workspaceMemberRepository,
);
const getRuleChunksUseCase = new GetRuleChunksUseCase(ruleRepository, workspaceMemberRepository);
const listRuleMarketplaceUseCase = new ListRuleMarketplaceUseCase(ruleMarketplaceRepository);
const createRuleFromPublicUseCase = new CreateRuleFromPublicUseCase(
  ruleRepository,
  workspaceRepository,
  workspaceMemberRepository,
);

// Controller
const ruleController = new RuleController(
  createRuleUseCase,
  getRuleUseCase,
  listRulesUseCase,
  updateRuleUseCase,
  deleteRuleUseCase,
  assignRuleToCompanyUseCase,
  unassignRuleFromCompanyUseCase,
  listCompanyRulesUseCase,
  listRuleCompaniesUseCase,
  retryRuleVectorizationUseCase,
  getRuleChunksUseCase,
);
const ruleMarketplaceController = new RuleMarketplaceController(
  listRuleMarketplaceUseCase,
  createRuleFromPublicUseCase,
);

ruleRouter.get(
  '/workspaces/:workspaceId/rules',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.list(req, res)),
);

ruleRouter.post(
  '/workspaces/:workspaceId/rules',
  ensureAuthenticated,
  upload.single('pdfFile'),
  asyncHandler((req, res) => ruleController.create(req, res)),
);

ruleRouter.get(
  '/rules/marketplace',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleMarketplaceController.list(req, res)),
);

ruleRouter.post(
  '/workspaces/:workspaceId/rules/from-public/:ruleId',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleMarketplaceController.createFromPublic(req, res)),
);

ruleRouter.get(
  '/rules/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.findById(req, res)),
);

ruleRouter.put(
  '/rules/:id',
  ensureAuthenticated,
  upload.single('pdfFile'),
  asyncHandler((req, res) => ruleController.update(req, res)),
);

ruleRouter.delete(
  '/rules/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.delete(req, res)),
);

ruleRouter.post(
  '/rules/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.assignToCompany(req, res)),
);

ruleRouter.get(
  '/rules/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.listRuleCompanies(req, res)),
);

ruleRouter.delete(
  '/rules/:id/companies/:companyId',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.unassignFromCompany(req, res)),
);

ruleRouter.get(
  '/companies/:companyId/rules',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.listCompanyRules(req, res)),
);

ruleRouter.post(
  '/rules/:id/vectorize',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.retryVectorization(req, res)),
);

ruleRouter.get(
  '/rules/:id/chunks',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.getChunks(req, res)),
);

export { ruleRouter };
