import { Router } from 'express';
import { SalesOrderController } from '../controllers/SalesOrderController';
import { PrismaSalesOrderRepository } from '../../repositories/PrismaSalesOrderRepository';
import { PrismaDeliveryNoteRepository } from '../../repositories/PrismaDeliveryNoteRepository';
import { PrismaBusinessPartnerRepository } from '../../repositories/PrismaBusinessPartnerRepository';
import { PrismaProductRepository } from '../../repositories/PrismaProductRepository';
import { PrismaStockRepository } from '../../repositories/PrismaStockRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaProformaInvoiceRepository } from '../../repositories/PrismaProformaInvoiceRepository';
import { CreateSalesOrderUseCase } from '../../../application/use-cases/sales-order/CreateSalesOrderUseCase';
import { ConfirmSalesOrderUseCase } from '../../../application/use-cases/sales-order/ConfirmSalesOrderUseCase';
import { GenerateDeliveryNoteUseCase } from '../../../application/use-cases/delivery-note/GenerateDeliveryNoteUseCase';
import { GenerateProformaUseCase } from '../../../application/use-cases/proforma/GenerateProformaUseCase';
import { ImportSalesOrderFromTemplateUseCase } from '../../../application/use-cases/sales-order/ImportSalesOrderFromTemplateUseCase';
import { CreateOrUpdatePartnerFromExtractionUseCase } from '../../../application/use-cases/business-partner/CreateOrUpdatePartnerFromExtractionUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';

const salesOrderRouter = Router();
const salesOrderRepository = new PrismaSalesOrderRepository(prisma);
const deliveryNoteRepository = new PrismaDeliveryNoteRepository(prisma);
const proformaInvoiceRepository = new PrismaProformaInvoiceRepository(prisma);
const partnerRepository = new PrismaBusinessPartnerRepository(prisma);
const productRepository = new PrismaProductRepository(prisma);
const stockRepository = new PrismaStockRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);

const createSalesOrderUseCase = new CreateSalesOrderUseCase(
  salesOrderRepository,
  productRepository,
  partnerRepository,
);

const controller = new SalesOrderController(
  createSalesOrderUseCase,
  new ConfirmSalesOrderUseCase(salesOrderRepository, stockRepository),
  new GenerateDeliveryNoteUseCase(
    salesOrderRepository,
    deliveryNoteRepository,
    partnerRepository,
    productRepository,
  ),
  new GenerateProformaUseCase(
    salesOrderRepository,
    proformaInvoiceRepository,
    partnerRepository,
    productRepository,
  ),
  new ImportSalesOrderFromTemplateUseCase(
    productRepository,
    partnerRepository,
    createSalesOrderUseCase,
    new CreateOrUpdatePartnerFromExtractionUseCase(partnerRepository),
  ),
  salesOrderRepository,
  userOnCompanyRepository,
);

/**
 * @swagger
 * /orders:
 *   get:
 *     summary: Elenca gli ordini di un'azienda
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [DRAFT, CONFIRMED, FULFILLED, CANCELLED] }
 *     responses:
 *       200: { description: Lista ordini }
 *   post:
 *     summary: Crea un ordine cliente (bozza)
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, partnerId, items]
 *             properties:
 *               companyId: { type: string }
 *               partnerId: { type: string }
 *               internalNotes: { type: string, nullable: true }
 *               deliveryNotesText: { type: string, nullable: true }
 *               sourceRef: { type: string, nullable: true }
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productId, quantity]
 *                   properties:
 *                     productId: { type: string }
 *                     quantity: { type: number }
 *                     unitPrice: { type: number, nullable: true }
 *                     discount: { type: number, nullable: true }
 *                     vatRate: { type: number, nullable: true }
 *     responses:
 *       201: { description: Ordine creato }
 *       400: { description: Dati mancanti o non validi }
 */
salesOrderRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);
salesOrderRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /orders/{id}/confirm:
 *   post:
 *     summary: Conferma un ordine validando la disponibilità di magazzino
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Ordine confermato }
 *       409: { description: Giacenza insufficiente o stato non valido }
 */
salesOrderRouter.post(
  '/:id/confirm',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.confirm(req, res)),
);

/**
 * @swagger
 * /orders/{id}/generate-ddt:
 *   post:
 *     summary: Genera un DDT da un ordine confermato (scarico magazzino atomico)
 *     tags: [Orders]
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
 *               causale: { type: string, nullable: true }
 *               carrier: { type: string, nullable: true }
 *               packagesCount: { type: number, nullable: true }
 *               estimatedWeightKg: { type: number, nullable: true }
 *               deliveryNotesText: { type: string, nullable: true }
 *     responses:
 *       201: { description: DDT generato }
 *       409: { description: Giacenza insufficiente o ordine non confermato }
 */
salesOrderRouter.post(
  '/:id/generate-ddt',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.generateDdt(req, res)),
);

/**
 * @swagger
 * /orders/{id}/generate-proforma:
 *   post:
 *     summary: Genera una fattura proforma (non fiscale) da un ordine DRAFT o CONFIRMED
 *     tags: [Orders]
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
 *               causale: { type: string, nullable: true }
 *               deliveryNotesText: { type: string, nullable: true }
 *     responses:
 *       201: { description: Proforma generata }
 *       409: { description: Stato ordine non valido }
 */
salesOrderRouter.post(
  '/:id/generate-proforma',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.generateProforma(req, res)),
);

/**
 * @swagger
 * /orders/template.xlsx:
 *   get:
 *     summary: Scarica il modello Excel ordine agenti (colonne fisse)
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: File .xlsx
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet: {}
 */
salesOrderRouter.get(
  '/template.xlsx',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.downloadTemplate(req, res)),
);

/**
 * @swagger
 * /orders/from-template:
 *   post:
 *     summary: Importa un ordine da modello Excel; crea una bozza se cliente e prodotti sono risolti
 *     tags: [Orders]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, companyId]
 *             properties:
 *               file: { type: string, format: binary }
 *               companyId: { type: string }
 *               partnerId: { type: string, nullable: true }
 *     responses:
 *       201: { description: Ordine bozza creato }
 *       200: { description: Anteprima — cliente o prodotti da risolvere (nessuna creazione) }
 *       400: { description: File o companyId mancanti / modello non valido }
 */
salesOrderRouter.post(
  '/from-template',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => controller.importFromTemplate(req, res)),
);

export { salesOrderRouter };
