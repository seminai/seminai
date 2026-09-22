import { Router } from 'express';
import { LlmCatalogController } from '../controllers/LlmCatalogController';
import { asyncHandler } from '../middlewares/asyncHandler';

const llmCatalogRouter = Router();
const controller = new LlmCatalogController();

/**
 * @swagger
 * /llm/providers/detect:
 *   get:
 *     summary: Detect configured LLM providers
 *     tags: [LLM]
 *     responses:
 *       200:
 *         description: Provider catalog without secrets
 */
llmCatalogRouter.get(
  '/providers/detect',
  asyncHandler((req, res) => controller.detect(req, res)),
);

/**
 * @swagger
 * /llm/models:
 *   get:
 *     summary: List models for a catalog provider
 *     tags: [LLM]
 *     parameters:
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Model ids for the selected provider
 *       400:
 *         description: Unknown provider
 */
llmCatalogRouter.get(
  '/models',
  asyncHandler((req, res) => controller.models(req, res)),
);

export { llmCatalogRouter };
