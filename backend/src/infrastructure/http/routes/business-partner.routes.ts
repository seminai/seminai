import { Router } from 'express';
import { BusinessPartnerController } from '../controllers/BusinessPartnerController';
import { PrismaBusinessPartnerRepository } from '../../repositories/PrismaBusinessPartnerRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { CreateBusinessPartnerUseCase } from '../../../application/use-cases/business-partner/CreateBusinessPartnerUseCase';
import { UpdateBusinessPartnerUseCase } from '../../../application/use-cases/business-partner/UpdateBusinessPartnerUseCase';
import { SearchBusinessPartnersUseCase } from '../../../application/use-cases/business-partner/SearchBusinessPartnersUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const businessPartnerRouter = Router();
const partnerRepository = new PrismaBusinessPartnerRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const controller = new BusinessPartnerController(
  new CreateBusinessPartnerUseCase(partnerRepository),
  new UpdateBusinessPartnerUseCase(partnerRepository),
  new SearchBusinessPartnersUseCase(partnerRepository),
  partnerRepository,
  userOnCompanyRepository,
);

/**
 * @swagger
 * /business-partners:
 *   get:
 *     summary: Elenca/cerca clienti e fornitori di un'azienda
 *     tags: [BusinessPartners]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: type
 *         schema: { type: string, enum: [CUSTOMER, SUPPLIER] }
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *     responses:
 *       200: { description: Lista anagrafiche }
 *       401: { description: Non autorizzato }
 */
businessPartnerRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.list(req, res)),
);

/**
 * @swagger
 * /business-partners:
 *   post:
 *     summary: Crea un cliente o fornitore (con deduplicazione)
 *     tags: [BusinessPartners]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [companyId, type, name]
 *             properties:
 *               companyId: { type: string }
 *               type: { type: string, enum: [CUSTOMER, SUPPLIER] }
 *               name: { type: string }
 *               vatNumber: { type: string, nullable: true }
 *               fiscalCode: { type: string, nullable: true }
 *               sdiCode: { type: string, nullable: true }
 *               pec: { type: string, nullable: true }
 *               email: { type: string, nullable: true }
 *               phone: { type: string, nullable: true }
 *               referent: { type: string, nullable: true }
 *               nation: { type: string, nullable: true }
 *               city: { type: string, nullable: true }
 *               address: { type: string, nullable: true }
 *               cap: { type: string, nullable: true }
 *               deliveryAddress: { type: string, nullable: true }
 *               deliveryCity: { type: string, nullable: true }
 *               deliveryCap: { type: string, nullable: true }
 *               deliveryNation: { type: string, nullable: true }
 *               deliveryNotesText: { type: string, nullable: true }
 *               deliveryHours: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       201: { description: Anagrafica creata o riutilizzata }
 *       400: { description: Dati mancanti o non validi }
 */
businessPartnerRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /business-partners/{id}:
 *   patch:
 *     summary: Aggiorna un cliente o fornitore
 *     tags: [BusinessPartners]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               vatNumber: { type: string, nullable: true }
 *               email: { type: string, nullable: true }
 *               isActive: { type: boolean }
 *     responses:
 *       200: { description: Anagrafica aggiornata }
 *       404: { description: Anagrafica non trovata }
 */
businessPartnerRouter.patch(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

export { businessPartnerRouter };
