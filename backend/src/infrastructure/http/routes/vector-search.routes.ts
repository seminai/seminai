import { Router } from 'express';
import { VectorSearchController } from '../controllers/VectorSearchController';
import { asyncHandler } from '../middlewares/asyncHandler';

const vectorSearchRouter = Router();
const controller = new VectorSearchController();

/**
 * @swagger
 * tags:
 *   name: VectorSearch
 *   description: Vector search operations for disciplinari management
 */

/**
 * @swagger
 * /vector-search/upsert-disciplinari-mongo:
 *   post:
 *     summary: Upsert disciplinari BDF into MongoDB vector store
 *     tags: [VectorSearch]
 *     description: Processes all disciplinari from bdf.csv and uploads them to MongoDB in batches of 3
 *     responses:
 *       200:
 *         description: All disciplinari processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 totalProcessed:
 *                   type: number
 *                 successCount:
 *                   type: number
 *                 errorCount:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       url:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       error:
 *                         type: string
 *       207:
 *         description: Processed with some errors
 *       500:
 *         description: Fatal error during processing
 */
vectorSearchRouter.post(
  '/upsert-disciplinari-mongo',
  asyncHandler(controller.upsertDisciplinariMongo.bind(controller)),
);

/**
 * @swagger
 * /vector-search/upsert-disciplinari-qdrant:
 *   post:
 *     summary: Upsert disciplinari BDF into Qdrant vector store
 *     tags: [VectorSearch]
 *     description: Processes all disciplinari from bdf.csv and uploads them to Qdrant in batches of 3
 *     responses:
 *       200:
 *         description: All disciplinari processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 totalProcessed:
 *                   type: number
 *                 successCount:
 *                   type: number
 *                 errorCount:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       title:
 *                         type: string
 *                       url:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       error:
 *                         type: string
 *       207:
 *         description: Processed with some errors
 *       500:
 *         description: Fatal error during processing
 */
vectorSearchRouter.post(
  '/upsert-disciplinari-qdrant',
  asyncHandler(controller.upsertDisciplinariQdrant.bind(controller)),
);

/**
 * @swagger
 * /vector-search/check-mongodb-status:
 *   get:
 *     summary: Check MongoDB vector store status
 *     tags: [VectorSearch]
 *     description: Verifies MongoDB connection and checks if data exists
 *     responses:
 *       200:
 *         description: MongoDB connection successful
 *       500:
 *         description: MongoDB connection error
 */
vectorSearchRouter.get(
  '/check-mongodb-status',
  asyncHandler(controller.checkMongoDBStatus.bind(controller)),
);

/**
 * @swagger
 * /vector-search/get-answer-mongodb:
 *   post:
 *     summary: Search disciplinari in MongoDB vector store
 *     tags: [VectorSearch]
 *     description: Performs semantic search on disciplinari stored in MongoDB
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *                 example: "Quali sono i trattamenti permessi per il pomodoro?"
 *               limit:
 *                 type: number
 *                 description: Maximum number of results to return (default 5)
 *                 example: 5
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 query:
 *                   type: string
 *                 limit:
 *                   type: number
 *                 resultsCount:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       content:
 *                         type: string
 *                       score:
 *                         type: number
 *                       source:
 *                         type: string
 *                       chunkIndex:
 *                         type: number
 *                       sourceType:
 *                         type: string
 *       400:
 *         description: Invalid request - query is required
 *       500:
 *         description: Search error
 */
vectorSearchRouter.post(
  '/get-answer-mongodb',
  asyncHandler(controller.getAnswerMongoDB.bind(controller)),
);

/**
 * @swagger
 * /vector-search/get-answer-qdrant:
 *   post:
 *     summary: Search disciplinari in Qdrant vector store
 *     tags: [VectorSearch]
 *     description: Performs semantic search on disciplinari stored in Qdrant
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: string
 *                 description: The search query
 *                 example: "Quali sono i trattamenti permessi per il pomodoro?"
 *               limit:
 *                 type: number
 *                 description: Maximum number of results to return (default 5)
 *                 example: 5
 *     responses:
 *       200:
 *         description: Search completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 query:
 *                   type: string
 *                 limit:
 *                   type: number
 *                 resultsCount:
 *                   type: number
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       content:
 *                         type: string
 *                       score:
 *                         type: number
 *                       source:
 *                         type: string
 *                       chunkIndex:
 *                         type: number
 *                       sourceType:
 *                         type: string
 *       400:
 *         description: Invalid request - query is required
 *       500:
 *         description: Search error
 */
vectorSearchRouter.post(
  '/get-answer-qdrant',
  asyncHandler(controller.getAnswerQdrant.bind(controller)),
);

export { vectorSearchRouter };
