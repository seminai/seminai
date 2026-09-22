import { Router } from 'express';
import { VectorSearchController } from '../controllers/VectorSearchController';
import { asyncHandler } from '../middlewares/asyncHandler';

const vectorSearchRouter = Router();
const controller = new VectorSearchController();

/**
 * @swagger
 * tags:
 *   name: VectorSearch
 *   description: Optional Qdrant vector-search operations
 * /vector-search/upsert-disciplinari-qdrant:
 *   post:
 *     summary: Index disciplinari in Qdrant
 *     tags: [VectorSearch]
 *     responses:
 *       200:
 *         description: All documents indexed
 *       207:
 *         description: Some documents could not be indexed
 *       500:
 *         description: Qdrant is unavailable or not configured
 * /vector-search/get-answer-qdrant:
 *   post:
 *     summary: Search disciplinari in Qdrant
 *     tags: [VectorSearch]
 *     responses:
 *       200:
 *         description: Search results
 *       400:
 *         description: Invalid query
 *       500:
 *         description: Qdrant is unavailable or not configured
 */
vectorSearchRouter.post(
  '/upsert-disciplinari-qdrant',
  asyncHandler(controller.upsertDisciplinariQdrant.bind(controller)),
);
vectorSearchRouter.post(
  '/get-answer-qdrant',
  asyncHandler(controller.getAnswerQdrant.bind(controller)),
);

export { vectorSearchRouter };
