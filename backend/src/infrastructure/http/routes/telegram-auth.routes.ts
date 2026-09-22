import { Router } from 'express';
import { TelegramAuthController } from '../controllers/TelegramAuthController';
import { TelegramLoginUseCase } from '../../../application/use-cases/auth/TelegramLoginUseCase';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { EmailService } from '../../services/EmailService';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const telegramAuthRouter = Router();
const userRepository = new PrismaUserRepository(prisma);
const emailService = EmailService.getInstance();

// Create email adapter for the use case
const emailAdapter = {
  sendEmail: async (to: string, subject: string, html: string) => {
    await emailService.sendRawEmail({ to, subject, text: '', html });
  },
};

const telegramLoginUseCase = new TelegramLoginUseCase(userRepository, emailAdapter);
const telegramAuthController = new TelegramAuthController(telegramLoginUseCase);

/**
 * @swagger
 * /auth/telegram/verify-phone:
 *   get:
 *     summary: Verifica se un numero di telefono è associato a un utente
 *     tags: [Auth - Telegram]
 *     parameters:
 *       - in: query
 *         name: phone
 *         required: true
 *         schema:
 *           type: string
 *         description: Numero di telefono da verificare (es. +393331234567)
 *     responses:
 *       200:
 *         description: Risultato della verifica
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     exists:
 *                       type: boolean
 *                     userId:
 *                       type: string
 *                     userName:
 *                       type: string
 *       400:
 *         description: Numero di telefono mancante
 */
telegramAuthRouter.get(
  '/verify-phone',
  asyncHandler((req, res) => telegramAuthController.verifyPhone(req, res)),
);

/**
 * @swagger
 * /auth/telegram/send-otp:
 *   post:
 *     summary: Invia un codice OTP via email per verificare il numero di telefono
 *     tags: [Auth - Telegram]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - telegramUserId
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Numero di telefono dell'utente
 *               telegramUserId:
 *                 type: number
 *                 description: ID utente Telegram
 *     responses:
 *       200:
 *         description: OTP inviato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     sent:
 *                       type: boolean
 *                     maskedEmail:
 *                       type: string
 *                       description: Email mascherata (es. f***@gmail.com)
 *       400:
 *         description: Dati mancanti
 *       404:
 *         description: Numero di telefono non trovato
 */
telegramAuthRouter.post(
  '/send-otp',
  asyncHandler((req, res) => telegramAuthController.sendOtp(req, res)),
);

/**
 * @swagger
 * /auth/telegram/verify-otp:
 *   post:
 *     summary: Verifica il codice OTP e completa il login
 *     tags: [Auth - Telegram]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - otp
 *               - telegramUserId
 *             properties:
 *               phone:
 *                 type: string
 *                 description: Numero di telefono dell'utente
 *               otp:
 *                 type: string
 *                 description: Codice OTP a 6 cifre
 *               telegramUserId:
 *                 type: number
 *                 description: ID utente Telegram
 *               telegramUsername:
 *                 type: string
 *                 description: Username Telegram (opzionale)
 *     responses:
 *       200:
 *         description: Login effettuato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     user:
 *                       type: object
 *       400:
 *         description: Dati mancanti o OTP non valido
 *       401:
 *         description: OTP errato o scaduto
 */
telegramAuthRouter.post(
  '/verify-otp',
  asyncHandler((req, res) => telegramAuthController.verifyOtp(req, res)),
);

export { telegramAuthRouter };
