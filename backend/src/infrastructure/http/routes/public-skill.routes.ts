import { Router } from 'express';
import { PublicSkillController } from '../controllers/PublicSkillController';
import { PrismaPublicSkillRepository } from '../../repositories/PrismaPublicSkillRepository';
import { ListPublicSkillsUseCase } from '../../../application/use-cases/skill/ListPublicSkillsUseCase';
import { GetPublicSkillBySlugUseCase } from '../../../application/use-cases/skill/GetPublicSkillBySlugUseCase';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createIpRateLimiter } from '../middlewares/rateLimiter';
import { prisma } from '../../repositories/Prisma';

const publicSkillRouter = Router();

const publicSkillRepository = new PrismaPublicSkillRepository(prisma);
const listPublicSkillsUseCase = new ListPublicSkillsUseCase(publicSkillRepository);
const getPublicSkillBySlugUseCase = new GetPublicSkillBySlugUseCase(publicSkillRepository);

const publicSkillController = new PublicSkillController(
  listPublicSkillsUseCase,
  getPublicSkillBySlugUseCase,
);

/**
 * Rate limiter dedicato al catalogo pubblico skill (no auth): 60 req/min per IP.
 */
const publicSkillRateLimiter = createIpRateLimiter(60, 60, 'public-skills');

/**
 * @swagger
 * tags:
 *   name: PublicSkills
 *   description: Catalogo pubblico Knowledge Hub (no auth) — skill AI indicizzabili
 */

/**
 * @swagger
 * /public/skills:
 *   get:
 *     summary: Elenca gli skill pubblici del Knowledge Hub (no auth)
 *     tags: [PublicSkills]
 *     parameters:
 *       - in: query
 *         name: search
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
 *         description: Lista paginata di skill pubblici
 */
publicSkillRouter.get(
  '/public/skills',
  publicSkillRateLimiter,
  asyncHandler((req, res) => publicSkillController.list(req, res)),
);

/**
 * @swagger
 * /public/skills/{slug}:
 *   get:
 *     summary: Dettaglio di uno skill pubblico per slug (no auth)
 *     tags: [PublicSkills]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Skill pubblico trovato
 *       404:
 *         description: Skill non trovato
 */
publicSkillRouter.get(
  '/public/skills/:slug',
  publicSkillRateLimiter,
  asyncHandler((req, res) => publicSkillController.findBySlug(req, res)),
);

export { publicSkillRouter };
