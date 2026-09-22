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

/**
 * @swagger
 * tags:
 *   name: Rules
 *   description: Gestione disciplinari e regole
 */

/**
 * @swagger
 * /workspaces/{workspaceId}/rules:
 *   get:
 *     summary: Elenca le regole di un workspace
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM]
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ARCHIVED, DEPRECATED]
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista regole
 */
ruleRouter.get(
  '/workspaces/:workspaceId/rules',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.list(req, res)),
);

/**
 * @swagger
 * /workspaces/{workspaceId}/rules:
 *   post:
 *     summary: Crea una nuova regola (con upload PDF opzionale)
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - category
 *               - content
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *                 enum: [DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM]
 *               content:
 *                 type: string
 *                 description: JSON string of the rule content
 *               sourceUrl:
 *                 type: string
 *               sourceDocument:
 *                 type: string
 *               region:
 *                 type: string
 *               validFrom:
 *                 type: string
 *                 format: date-time
 *               validUntil:
 *                 type: string
 *                 format: date-time
 *               version:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *               isTemplate:
 *                 type: boolean
 *               pdfFile:
 *                 type: string
 *                 format: binary
 *                 description: Optional PDF file for vectorization
 *     responses:
 *       201:
 *         description: Regola creata
 */
ruleRouter.post(
  '/workspaces/:workspaceId/rules',
  ensureAuthenticated,
  upload.single('pdfFile'),
  asyncHandler((req, res) => ruleController.create(req, res)),
);

/**
 * @swagger
 * /rules/marketplace:
 *   get:
 *     summary: Elenca le regole pubbliche disponibili nel marketplace
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [DISCIPLINARE, STANDARD, BEST_PRACTICE, METHODOLOGY, CUSTOM]
 *       - in: query
 *         name: region
 *         schema:
 *           type: string
 *       - in: query
 *         name: creator
 *         schema:
 *           type: string
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *     responses:
 *       200:
 *         description: Lista marketplace
 */
ruleRouter.get(
  '/rules/marketplace',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleMarketplaceController.list(req, res)),
);

/**
 * @swagger
 * /workspaces/{workspaceId}/rules/from-public/{ruleId}:
 *   post:
 *     summary: Duplica una regola pubblica nel workspace
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: ruleId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Regola privata creata
 */
ruleRouter.post(
  '/workspaces/:workspaceId/rules/from-public/:ruleId',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleMarketplaceController.createFromPublic(req, res)),
);

/**
 * @swagger
 * /rules/{id}:
 *   get:
 *     summary: Ottiene una regola per ID
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Regola trovata
 */
ruleRouter.get(
  '/rules/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.findById(req, res)),
);

/**
 * @swagger
 * /rules/{id}:
 *   put:
 *     summary: Aggiorna una regola (con upload PDF opzionale)
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               pdfFile:
 *                 type: string
 *                 format: binary
 *                 description: Optional PDF file for vectorization
 *     responses:
 *       200:
 *         description: Regola aggiornata
 */
ruleRouter.put(
  '/rules/:id',
  ensureAuthenticated,
  upload.single('pdfFile'),
  asyncHandler((req, res) => ruleController.update(req, res)),
);

/**
 * @swagger
 * /rules/{id}:
 *   delete:
 *     summary: Elimina una regola
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Regola eliminata
 */
ruleRouter.delete(
  '/rules/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.delete(req, res)),
);

/**
 * @swagger
 * /rules/{id}/companies:
 *   post:
 *     summary: Assegna una regola a una company
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyId
 *             properties:
 *               companyId:
 *                 type: string
 *               workspaceId:
 *                 type: string
 *                 description: Workspace attivo usato per autorizzare regole pubbliche
 *               priority:
 *                 type: integer
 *               overrides:
 *                 type: object
 *               notes:
 *                 type: string
 *     responses:
 *       201:
 *         description: Regola assegnata
 */
ruleRouter.post(
  '/rules/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.assignToCompany(req, res)),
);

/**
 * @swagger
 * /rules/{id}/companies:
 *   get:
 *     summary: Elenca le aziende assegnate a una regola
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista aziende assegnate alla regola
 */
ruleRouter.get(
  '/rules/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.listRuleCompanies(req, res)),
);

/**
 * @swagger
 * /rules/{id}/companies/{companyId}:
 *   delete:
 *     summary: Rimuove l'assegnazione di una regola da una company
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Assegnazione rimossa
 */
ruleRouter.delete(
  '/rules/:id/companies/:companyId',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.unassignFromCompany(req, res)),
);

/**
 * @swagger
 * /companies/{companyId}/rules:
 *   get:
 *     summary: Elenca le regole assegnate a una company
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: onlyActive
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista regole della company
 */
ruleRouter.get(
  '/companies/:companyId/rules',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.listCompanyRules(req, res)),
);

/**
 * @swagger
 * /rules/{id}/vectorize:
 *   post:
 *     summary: Riaccoda la vettorializzazione del PDF di una regola
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       202:
 *         description: Job di vettorializzazione accodato
 */
ruleRouter.post(
  '/rules/:id/vectorize',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.retryVectorization(req, res)),
);

/**
 * @swagger
 * /rules/{id}/chunks:
 *   get:
 *     summary: Anteprima dei chunk vettorializzati per una regola
 *     tags: [Rules]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Lista chunk
 */
ruleRouter.get(
  '/rules/:id/chunks',
  ensureAuthenticated,
  asyncHandler((req, res) => ruleController.getChunks(req, res)),
);

export { ruleRouter };
