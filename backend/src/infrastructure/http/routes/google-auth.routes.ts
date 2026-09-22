import { Router } from 'express';
import { GoogleAuthController } from '../controllers/GoogleAuthController';
import { GoogleLoginUseCase } from '../../../application/use-cases/auth/GoogleLoginUseCase';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const googleAuthRouter = Router();
const userRepository = new PrismaUserRepository(prisma);

const googleLoginUseCase = new GoogleLoginUseCase(userRepository);
const googleAuthController = new GoogleAuthController(googleLoginUseCase);

/**
 * @swagger
 * /auth/google/login:
 *   post:
 *     summary: Login con Google (ID Token verification)
 *     tags: [Auth - Google]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - idToken
 *             properties:
 *               idToken:
 *                 type: string
 *                 description: Google ID token ottenuto dal frontend via Google Sign-In
 *     responses:
 *       200:
 *         description: Login effettuato con successo
 *       400:
 *         description: ID token mancante
 *       401:
 *         description: Token non valido o utente non trovato
 */
googleAuthRouter.post(
  '/login',
  asyncHandler((req, res) => googleAuthController.login(req, res)),
);

export { googleAuthRouter };
