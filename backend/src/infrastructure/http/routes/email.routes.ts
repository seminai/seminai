import { Router } from 'express';
import { EmailController } from '../controllers/EmailController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { EmailService } from '../../services/EmailService';
import { EmailRepository } from '../../repositories/EmailRepository';
import { SendContactEmailUseCase } from '../../../application/use-cases/email/SendContactEmailUseCase';
import { upload } from '../../services/Multer';

export const emailRouter = Router();
const emailService = EmailService.getInstance();
const emailRepository = new EmailRepository(emailService);
const sendContactEmailUseCase = new SendContactEmailUseCase(emailRepository);
const emailController = new EmailController(emailService, sendContactEmailUseCase);

/**
 * @swagger
 * /email/test:
 *   post:
 *     summary: Invia una email di test (MailHog)
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Email di test inviata
 *       400:
 *         description: Email mancante o invalida
 */
emailRouter.post(
  '/test',
  asyncHandler((req, res) => emailController.test(req, res)),
);

/**
 * @swagger
 * /email/send-email:
 *   post:
 *     summary: Invia un messaggio al team Seminai con allegati PDF opzionali
 *     tags: [Email]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 80
 *               email:
 *                 type: string
 *                 format: email
 *               body:
 *                 type: string
 *                 maxLength: 4000
 *                 description: Optional message text
 *               files:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: binary
 *                 description: File PDF opzionali (max 10MB per file, 20MB totale)
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *                 maxLength: 80
 *               email:
 *                 type: string
 *                 format: email
 *               body:
 *                 type: string
 *                 maxLength: 4000
 *                 description: Optional message text
 *     responses:
 *       202:
 *         description: Messaggio accettato e inoltrato
 *       400:
 *         description: Dati mancanti o non validi
 *       429:
 *         description: Troppe richieste consecutive
 */
emailRouter.post(
  '/send-email',
  upload.array('files', 5),
  asyncHandler((req, res) => emailController.sendContactEmail(req, res)),
);
