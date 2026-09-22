import { Router } from 'express';
import { CommercialController } from '../controllers/CommercialController';
import { PrismaSalesOrderRepository } from '../../repositories/PrismaSalesOrderRepository';
import { PrismaDeliveryNoteRepository } from '../../repositories/PrismaDeliveryNoteRepository';
import { PrismaEmailIngestionRepository } from '../../repositories/PrismaEmailIngestionRepository';
import { PrismaBusinessPartnerRepository } from '../../repositories/PrismaBusinessPartnerRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaProformaInvoiceRepository } from '../../repositories/PrismaProformaInvoiceRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaSalesInvoiceRepository } from '../../repositories/PrismaSalesInvoiceRepository';
import { GetCommercialInboxUseCase } from '../../../application/use-cases/commercial/GetCommercialInboxUseCase';
import { GetCommercialDeadlinesUseCase } from '../../../application/use-cases/commercial/GetCommercialDeadlinesUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const commercialRouter = Router();
const salesOrderRepository = new PrismaSalesOrderRepository(prisma);
const deliveryNoteRepository = new PrismaDeliveryNoteRepository(prisma);
const emailIngestionRepository = new PrismaEmailIngestionRepository();
const partnerRepository = new PrismaBusinessPartnerRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const proformaInvoiceRepository = new PrismaProformaInvoiceRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const salesInvoiceRepository = new PrismaSalesInvoiceRepository(prisma);

const controller = new CommercialController(
  new GetCommercialInboxUseCase(
    salesOrderRepository,
    deliveryNoteRepository,
    emailIngestionRepository,
    partnerRepository,
    proformaInvoiceRepository,
    salesInvoiceRepository,
  ),
  new GetCommercialDeadlinesUseCase(
    salesOrderRepository,
    deliveryNoteRepository,
    emailIngestionRepository,
    partnerRepository,
    salesInvoiceRepository,
  ),
  userOnCompanyRepository,
  companyRepository,
);

/**
 * @swagger
 * /commercial/inbox:
 *   get:
 *     summary: Elenco operativo "cosa fare oggi" (ordini, DDT, email) di un'azienda
 *     tags: [Commercial]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lista voci inbox ordinate per priorità }
 *       400: { description: companyId mancante }
 *       403: { description: Nessun accesso all'azienda }
 */
commercialRouter.get(
  '/inbox',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getInbox(req, res)),
);

/**
 * @swagger
 * /commercial/deadlines:
 *   get:
 *     summary: Contatori widget dashboard (ordini, DDT in uscita, fatture scadute, email)
 *     tags: [Commercial]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Contatori dashboard }
 *       400: { description: companyId mancante }
 *       403: { description: Nessun accesso all'azienda }
 */
commercialRouter.get(
  '/deadlines',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getDeadlines(req, res)),
);

/**
 * @swagger
 * /commercial/courier-email:
 *   get:
 *     summary: Legge l'email del corriere per i riepiloghi spedizioni
 *     tags: [Commercial]
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Email corriere (può essere null) }
 *   patch:
 *     summary: Imposta l'email del corriere
 *     tags: [Commercial]
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId]
 *             properties:
 *               companyId: { type: string }
 *               courierEmail: { type: string, nullable: true }
 *     responses:
 *       200: { description: Email corriere aggiornata }
 */
commercialRouter.get(
  '/courier-email',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.getCourierEmail(req, res)),
);
commercialRouter.patch(
  '/courier-email',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.updateCourierEmail(req, res)),
);

export { commercialRouter };
