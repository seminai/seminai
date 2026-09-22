import { Router } from 'express';
import { PublicRuleController } from '../controllers/PublicRuleController';
import { PrismaPublicRuleRepository } from '../../repositories/PrismaPublicRuleRepository';
import { ListPublicRulesUseCase } from '../../../application/use-cases/rule/ListPublicRulesUseCase';
import { GetPublicRuleBySlugUseCase } from '../../../application/use-cases/rule/GetPublicRuleBySlugUseCase';
import { ListPublicRuleCategoriesUseCase } from '../../../application/use-cases/rule/ListPublicRuleCategoriesUseCase';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createIpRateLimiter } from '../middlewares/rateLimiter';
import { prisma } from '../../repositories/Prisma';

const publicRuleRouter = Router();

const publicRuleRepository = new PrismaPublicRuleRepository(prisma);
const listPublicRulesUseCase = new ListPublicRulesUseCase(publicRuleRepository);
const getPublicRuleBySlugUseCase = new GetPublicRuleBySlugUseCase(publicRuleRepository);
const listPublicRuleCategoriesUseCase = new ListPublicRuleCategoriesUseCase(publicRuleRepository);

const publicRuleController = new PublicRuleController(
  listPublicRulesUseCase,
  getPublicRuleBySlugUseCase,
  listPublicRuleCategoriesUseCase,
);

/**
 * Rate limiter dedicato per il catalogo pubblico (no auth): 60 req/min per IP.
 * Protegge da scraping aggressivo mantenendo margine per crawler SEO/AI legittimi.
 */
const publicRuleRateLimiter = createIpRateLimiter(60, 60, 'public-rules');

/**
 * @swagger
 * tags:
 *   name: PublicRules
 *   description: Catalogo pubblico Knowledge Hub (no auth) — regole/disciplinari indicizzabili
 */

/**
 * @swagger
 * /public/rules:
 *   get:
 *     summary: Elenca le regole pubbliche del Knowledge Hub (no auth)
 *     tags: [PublicRules]
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
 *         description: Lista paginata di regole pubbliche
 */
publicRuleRouter.get(
  '/public/rules',
  publicRuleRateLimiter,
  asyncHandler((req, res) => publicRuleController.list(req, res)),
);

/**
 * @swagger
 * /public/rules/categories:
 *   get:
 *     summary: Facets per categoria delle regole pubbliche
 *     tags: [PublicRules]
 *     responses:
 *       200:
 *         description: Conteggio regole pubbliche per categoria
 */
publicRuleRouter.get(
  '/public/rules/categories',
  publicRuleRateLimiter,
  asyncHandler((req, res) => publicRuleController.listCategories(req, res)),
);

/**
 * @swagger
 * /public/rules/{slug}:
 *   get:
 *     summary: Dettaglio di una regola pubblica per slug (no auth)
 *     tags: [PublicRules]
 *     parameters:
 *       - in: path
 *         name: slug
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Regola pubblica trovata
 *       404:
 *         description: Regola non trovata
 */
publicRuleRouter.get(
  '/public/rules/:slug',
  publicRuleRateLimiter,
  asyncHandler((req, res) => publicRuleController.findBySlug(req, res)),
);

export { publicRuleRouter };
