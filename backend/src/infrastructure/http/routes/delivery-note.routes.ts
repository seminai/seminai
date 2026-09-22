import { Router } from 'express';
import { DeliveryNoteController } from '../controllers/DeliveryNoteController';
import { PrismaDeliveryNoteRepository } from '../../repositories/PrismaDeliveryNoteRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { GetDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/GetDeliveryNoteUseCase';
import { CancelDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/CancelDeliveryNoteUseCase';
import { MarkSentDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/MarkSentDeliveryNoteUseCase';
import { GetShippingSummaryUseCase } from '../../../application/use-cases/delivery-note/GetShippingSummaryUseCase';
import { SendCourierSummaryEmailUseCase } from '../../../application/use-cases/delivery-note/SendCourierSummaryEmailUseCase';
import { EmailService } from '../../services/EmailService';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const deliveryNoteRouter = Router();
const deliveryNoteRepository = new PrismaDeliveryNoteRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);

const controller = new DeliveryNoteController(
  new GetDeliveryNoteUseCase(deliveryNoteRepository),
  new CancelDeliveryNoteUseCase(deliveryNoteRepository),
  new MarkSentDeliveryNoteUseCase(deliveryNoteRepository),
  new GetShippingSummaryUseCase(deliveryNoteRepository),
  new SendCourierSummaryEmailUseCase(
    deliveryNoteRepository,
    companyRepository,
    EmailService.getInstance(),
  ),
  deliveryNoteRepository,
  companyRepository,
  userOnCompanyRepository,
);

/**
 * @swagger
 * /ddt:
 *   get:
 *     summary: Elenca i DDT di un'azienda
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [GENERATED, SENT, CANCELLED] }
 *     responses:
 *       200: { description: Lista DDT }
 */
deliveryNoteRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

/**
 * @swagger
 * /ddt/shipping-summary:
 *   get:
 *     summary: Riepilogo spedizioni (DDT generati aggregati per data + vettore)
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Riepilogo aggregato }
 */
deliveryNoteRouter.get(
  '/shipping-summary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getShippingSummary(req, res)),
);

/**
 * @swagger
 * /ddt/send-courier-summary:
 *   post:
 *     summary: Invia il riepilogo spedizioni al corriere e marca i DDT come INVIATI
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId]
 *             properties:
 *               companyId: { type: string }
 *     responses:
 *       200: { description: "Email inviata, DDT marcati SENT" }
 *       400: { description: Email corriere non configurata }
 */
deliveryNoteRouter.post(
  '/send-courier-summary',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.sendCourierSummary(req, res)),
);

/**
 * @swagger
 * /ddt/{id}:
 *   get:
 *     summary: Ottiene un DDT con le sue righe
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: DDT trovato }
 *       404: { description: DDT non trovato }
 */
deliveryNoteRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

/**
 * @swagger
 * /ddt/{id}/print:
 *   get:
 *     summary: Documento DDT stampabile (HTML)
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: HTML stampabile
 *         content:
 *           text/html:
 *             schema: { type: string }
 */
deliveryNoteRouter.get(
  '/:id/print',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.print(req, res)),
);

/**
 * @swagger
 * /ddt/{id}/cancel:
 *   post:
 *     summary: Annulla un DDT con storno/rientro magazzino
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason: { type: string, nullable: true }
 *     responses:
 *       200: { description: DDT annullato e magazzino ripristinato }
 *       409: { description: DDT già annullato }
 */
deliveryNoteRouter.post(
  '/:id/cancel',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.cancel(req, res)),
);

/**
 * @swagger
 * /ddt/{id}/mark-sent:
 *   post:
 *     summary: Marca un DDT come INVIATO (consegnato al corriere)
 *     tags: [DeliveryNotes]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: DDT marcato SENT }
 *       409: { description: DDT già inviato o non generato }
 */
deliveryNoteRouter.post(
  '/:id/mark-sent',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.markSent(req, res)),
);

export { deliveryNoteRouter };
