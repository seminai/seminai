import { Router } from 'express';
import { prisma } from '../../repositories/Prisma';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { PrismaExtractionApiAccountRepository } from '../../repositories/PrismaExtractionApiAccountRepository';
import { PrismaExtractionApiKeyRepository } from '../../repositories/PrismaExtractionApiKeyRepository';
import { PrismaExtractionApiUsageLogRepository } from '../../repositories/PrismaExtractionApiUsageLogRepository';
import { RegisterExtractionApiUserUseCase } from '../../../application/use-cases/extraction-api/RegisterExtractionApiUserUseCase';
import { GetExtractionApiAccountUseCase } from '../../../application/use-cases/extraction-api/GetExtractionApiAccountUseCase';
import { EnsureExtractionApiAccountUseCase } from '../../../application/use-cases/extraction-api/EnsureExtractionApiAccountUseCase';
import { CreateExtractionApiKeyUseCase } from '../../../application/use-cases/extraction-api/CreateExtractionApiKeyUseCase';
import { ListExtractionApiKeysUseCase } from '../../../application/use-cases/extraction-api/ListExtractionApiKeysUseCase';
import { RevokeExtractionApiKeyUseCase } from '../../../application/use-cases/extraction-api/RevokeExtractionApiKeyUseCase';
import { ListExtractionApiUsageUseCase } from '../../../application/use-cases/extraction-api/ListExtractionApiUsageUseCase';
import { ExtractDocumentApiUseCase } from '../../../application/use-cases/extraction-api/ExtractDocumentApiUseCase';
import { ExtractionApiController } from '../controllers/ExtractionApiController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureExtractionApiKey } from '../middlewares/ensureExtractionApiKey';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createApiKeyRateLimiter, createIpRateLimiter } from '../middlewares/rateLimiter';
import { upload } from '../../services/Multer';

const userRepository = new PrismaUserRepository(prisma);
const accountRepository = new PrismaExtractionApiAccountRepository(prisma);
const keyRepository = new PrismaExtractionApiKeyRepository(prisma);
const usageRepository = new PrismaExtractionApiUsageLogRepository(prisma);

const controller = new ExtractionApiController(
  new RegisterExtractionApiUserUseCase(userRepository, accountRepository),
  new GetExtractionApiAccountUseCase(accountRepository),
  new EnsureExtractionApiAccountUseCase(accountRepository),
  new CreateExtractionApiKeyUseCase(keyRepository),
  new ListExtractionApiKeysUseCase(keyRepository),
  new RevokeExtractionApiKeyUseCase(keyRepository),
  new ListExtractionApiUsageUseCase(usageRepository),
  new ExtractDocumentApiUseCase(accountRepository, usageRepository),
);

const registerRateLimiter = createIpRateLimiter(20, 60, 'extraction-api-register');
const extractRateLimiter = createApiKeyRateLimiter(30, 60, 'extraction-api-extract');

export const extractionApiRouter = Router();

/**
 * @swagger
 * tags:
 *   - name: Extraction API
 *     description: Public document extraction API (invoice, DDT, auto-detect)
 */

/**
 * @swagger
 * /api/v1/extract/register:
 *   post:
 *     summary: Register an Extraction API account
 *     tags: [Extraction API]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, name, inviteCode]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string }
 *               name: { type: string }
 *               inviteCode: { type: string }
 *     responses:
 *       201:
 *         description: Account created with trial page quota
 */
extractionApiRouter.post(
  '/register',
  registerRateLimiter,
  asyncHandler((req, res) => controller.register(req, res)),
);

/**
 * @swagger
 * /api/v1/extract/account:
 *   get:
 *     summary: Get page quota balance
 *     description: Returns the Extraction API account quota. Creates a trial account automatically if the authenticated user does not have one yet.
 *     tags: [Extraction API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Current quota summary (account auto-provisioned with trial pages when missing)
 */
extractionApiRouter.get(
  '/account',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getAccount(req, res)),
);

/**
 * @swagger
 * /api/v1/extract/api-keys:
 *   post:
 *     summary: Create a new API key
 *     tags: [Extraction API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       201:
 *         description: API key created successfully
 *   get:
 *     summary: List API keys
 *     tags: [Extraction API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: API keys list
 */
extractionApiRouter.post(
  '/api-keys',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.createApiKey(req, res)),
);
extractionApiRouter.get(
  '/api-keys',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listApiKeys(req, res)),
);

/**
 * @swagger
 * /api/v1/extract/api-keys/{id}:
 *   delete:
 *     summary: Revoke an API key
 *     tags: [Extraction API]
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
 *         description: API key revoked successfully
 */
extractionApiRouter.delete(
  '/api-keys/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.revokeApiKey(req, res)),
);

/**
 * @swagger
 * /api/v1/extract/usage:
 *   get:
 *     summary: List extraction usage history
 *     tags: [Extraction API]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Extraction usage history
 */
extractionApiRouter.get(
  '/usage',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listUsage(req, res)),
);

/**
 * @swagger
 * /api/v1/extract/document:
 *   post:
 *     summary: Extract structured data from invoice or DDT
 *     tags: [Extraction API]
 *     security:
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               documentType:
 *                 type: string
 *                 enum: [invoice, ddt, auto]
 *                 default: auto
 *     responses:
 *       200:
 *         description: Extraction completed
 *       402:
 *         description: Insufficient page quota
 */
extractionApiRouter.post(
  '/document',
  extractRateLimiter,
  ensureExtractionApiKey,
  upload.single('file'),
  asyncHandler((req, res) => controller.extractDocument(req, res)),
);
