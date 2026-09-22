import { Router } from 'express';
import { SkillController } from '../controllers/SkillController';
import { SkillMarketplaceController } from '../controllers/SkillMarketplaceController';
import { PrismaSkillRepository } from '../../repositories/PrismaSkillRepository';
import { PrismaSkillMarketplaceRepository } from '../../repositories/PrismaSkillMarketplaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../repositories/PrismaWorkspaceMemberRepository';
import { CreateSkillUseCase } from '../../../application/use-cases/skill/CreateSkillUseCase';
import { GetSkillUseCase } from '../../../application/use-cases/skill/GetSkillUseCase';
import { ListSkillsUseCase } from '../../../application/use-cases/skill/ListSkillsUseCase';
import { UpdateSkillUseCase } from '../../../application/use-cases/skill/UpdateSkillUseCase';
import { DeleteSkillUseCase } from '../../../application/use-cases/skill/DeleteSkillUseCase';
import { ListSkillMarketplaceUseCase } from '../../../application/use-cases/skill/ListSkillMarketplaceUseCase';
import { CreateSkillFromPublicUseCase } from '../../../application/use-cases/skill/CreateSkillFromPublicUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const skillRouter = Router();

const skillRepository = new PrismaSkillRepository(prisma);
const skillMarketplaceRepository = new PrismaSkillMarketplaceRepository(prisma);
const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);

const createSkillUseCase = new CreateSkillUseCase(skillRepository, workspaceMemberRepository);
const getSkillUseCase = new GetSkillUseCase(skillRepository, workspaceMemberRepository);
const listSkillsUseCase = new ListSkillsUseCase(skillRepository, workspaceMemberRepository);
const updateSkillUseCase = new UpdateSkillUseCase(skillRepository, workspaceMemberRepository);
const deleteSkillUseCase = new DeleteSkillUseCase(skillRepository, workspaceMemberRepository);
const listSkillMarketplaceUseCase = new ListSkillMarketplaceUseCase(skillMarketplaceRepository);
const createSkillFromPublicUseCase = new CreateSkillFromPublicUseCase(
  skillRepository,
  workspaceMemberRepository,
);

const skillController = new SkillController(
  createSkillUseCase,
  getSkillUseCase,
  listSkillsUseCase,
  updateSkillUseCase,
  deleteSkillUseCase,
);
const skillMarketplaceController = new SkillMarketplaceController(
  listSkillMarketplaceUseCase,
  createSkillFromPublicUseCase,
);

/**
 * @swagger
 * tags:
 *   name: Skills
 *   description: Skill AI (prompt/workflow riusabili collegati a una Rule)
 */

/**
 * @swagger
 * /workspaces/{workspaceId}/skills:
 *   get:
 *     summary: Elenca gli skill di un workspace
 *     tags: [Skills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [DRAFT, ACTIVE, ARCHIVED]
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista skill
 */
skillRouter.get(
  '/workspaces/:workspaceId/skills',
  ensureAuthenticated,
  asyncHandler((req, res) => skillController.list(req, res)),
);

/**
 * @swagger
 * /workspaces/{workspaceId}/skills:
 *   post:
 *     summary: Crea un nuovo skill
 *     tags: [Skills]
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
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - instructions
 *             properties:
 *               name:
 *                 type: string
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               instructions:
 *                 type: string
 *               sourceRuleId:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Skill creato
 */
skillRouter.post(
  '/workspaces/:workspaceId/skills',
  ensureAuthenticated,
  asyncHandler((req, res) => skillController.create(req, res)),
);

/**
 * @swagger
 * /skills/marketplace:
 *   get:
 *     summary: Elenca gli skill pubblici disponibili nel marketplace
 *     tags: [Skills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: search
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
 *         description: Lista marketplace skill
 */
skillRouter.get(
  '/skills/marketplace',
  ensureAuthenticated,
  asyncHandler((req, res) => skillMarketplaceController.list(req, res)),
);

/**
 * @swagger
 * /workspaces/{workspaceId}/skills/from-public/{skillId}:
 *   post:
 *     summary: Duplica uno skill pubblico nel workspace
 *     tags: [Skills]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: workspaceId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: skillId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       201:
 *         description: Skill privato creato
 */
skillRouter.post(
  '/workspaces/:workspaceId/skills/from-public/:skillId',
  ensureAuthenticated,
  asyncHandler((req, res) => skillMarketplaceController.createFromPublic(req, res)),
);

/**
 * @swagger
 * /skills/{id}:
 *   get:
 *     summary: Ottiene uno skill per ID
 *     tags: [Skills]
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
 *         description: Skill trovato
 */
skillRouter.get(
  '/skills/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => skillController.findById(req, res)),
);

/**
 * @swagger
 * /skills/{id}:
 *   put:
 *     summary: Aggiorna uno skill
 *     tags: [Skills]
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
 *         description: Skill aggiornato
 */
skillRouter.put(
  '/skills/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => skillController.update(req, res)),
);

/**
 * @swagger
 * /skills/{id}:
 *   delete:
 *     summary: Elimina uno skill
 *     tags: [Skills]
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
 *         description: Skill eliminato
 */
skillRouter.delete(
  '/skills/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => skillController.delete(req, res)),
);

export { skillRouter };
