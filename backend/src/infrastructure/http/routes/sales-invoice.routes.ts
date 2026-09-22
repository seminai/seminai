import { Router } from 'express';
import { SalesInvoiceController } from '../controllers/SalesInvoiceController';
import { PrismaSalesInvoiceRepository } from '../../repositories/PrismaSalesInvoiceRepository';
import { PrismaBusinessPartnerRepository } from '../../repositories/PrismaBusinessPartnerRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { SendPaymentReminderEmailUseCase } from '../../../application/use-cases/sales-invoice/SendPaymentReminderEmailUseCase';
import { MarkInvoicePaidUseCase } from '../../../application/use-cases/sales-invoice/MarkInvoicePaidUseCase';
import { EmailService } from '../../services/EmailService';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const salesInvoiceRouter = Router();
const salesInvoiceRepository = new PrismaSalesInvoiceRepository(prisma);
const businessPartnerRepository = new PrismaBusinessPartnerRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);

const controller = new SalesInvoiceController(
  new SendPaymentReminderEmailUseCase(
    salesInvoiceRepository,
    businessPartnerRepository,
    companyRepository,
    EmailService.getInstance(),
  ),
  new MarkInvoicePaidUseCase(salesInvoiceRepository),
  salesInvoiceRepository,
  userOnCompanyRepository,
);

/**
 * @swagger
 * /sales-invoices:
 *   get:
 *     summary: Elenca le fatture di vendita di un'azienda
 *     tags: [SalesInvoices]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: overdue
 *         schema: { type: string, enum: ['true'] }
 *     responses:
 *       200: { description: Lista fatture con stato derivato }
 */
salesInvoiceRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

/**
 * @swagger
 * /sales-invoices/{id}/send-reminder:
 *   post:
 *     summary: Invia al cliente un sollecito di pagamento
 *     tags: [SalesInvoices]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Sollecito inviato }
 *       400: { description: Cliente senza email }
 */
salesInvoiceRouter.post(
  '/:id/send-reminder',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.sendReminder(req, res)),
);

/**
 * @swagger
 * /sales-invoices/{id}/mark-paid:
 *   post:
 *     summary: Marca una fattura come pagata
 *     tags: [SalesInvoices]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Fattura marcata pagata }
 */
salesInvoiceRouter.post(
  '/:id/mark-paid',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.markPaid(req, res)),
);

export { salesInvoiceRouter };
