import { Router } from 'express';
import { ProformaController } from '../controllers/ProformaController';
import { PrismaProformaInvoiceRepository } from '../../repositories/PrismaProformaInvoiceRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { GetProformaUseCase } from '../../../application/use-cases/proforma/GetProformaUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const proformaRouter = Router();
const proformaInvoiceRepository = new PrismaProformaInvoiceRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);

const controller = new ProformaController(
  new GetProformaUseCase(proformaInvoiceRepository),
  companyRepository,
  userOnCompanyRepository,
);

/**
 * @swagger
 * /proforma/{id}:
 *   get:
 *     summary: Ottiene una proforma con le sue righe
 *     tags: [Proforma]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Proforma trovata }
 *       404: { description: Proforma non trovata }
 */
proformaRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

/**
 * @swagger
 * /proforma/{id}/print:
 *   get:
 *     summary: Documento proforma stampabile (HTML)
 *     tags: [Proforma]
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
proformaRouter.get(
  '/:id/print',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.print(req, res)),
);

export { proformaRouter };
