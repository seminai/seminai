import { Router } from 'express';
import { CompanyController } from '../controllers/CompanyController';
import { CompanyDeletionController } from '../controllers/CompanyDeletionController';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaRuleOnCompanyRepository } from '../../repositories/PrismaRuleOnCompanyRepository';
import { PrismaWorkspaceRepository } from '../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../../repositories/PrismaCompanyOnWorkspaceRepository';
import { PrismaFieldRepository } from '../../repositories/PrismaFieldRepository';
import { PrismaProductionUnitRepository } from '../../repositories/PrismaProductionUnitRepository';
import { CreateCompanyUseCase } from '../../../application/use-cases/company/CreateCompanyUseCase';
import { DeleteCompaniesWithAllDataUseCase } from '../../../application/use-cases/company/DeleteCompaniesWithAllDataUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { ensureCompanyIdsRole } from '../middlewares/ensureCompanyIdsRole';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { prisma } from '../../repositories/Prisma';
import { CompanyRole } from '@prisma/client';

const companyRouter = Router();
const companyRepository = new PrismaCompanyRepository(prisma);
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const ruleOnCompanyRepository = new PrismaRuleOnCompanyRepository(prisma);
const workspaceRepository = new PrismaWorkspaceRepository(prisma);
const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
const companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);
const fieldRepository = new PrismaFieldRepository(prisma);
const productionUnitRepository = new PrismaProductionUnitRepository(prisma);

const createCompanyUseCase = new CreateCompanyUseCase(
  companyRepository,
  userOnCompanyRepository,
  workspaceRepository,
  workspaceMemberRepository,
  companyOnWorkspaceRepository,
);
const deleteCompaniesWithAllDataUseCase = new DeleteCompaniesWithAllDataUseCase(companyRepository);

const companyController = new CompanyController(
  companyRepository,
  userOnCompanyRepository,
  createCompanyUseCase,
  ruleOnCompanyRepository,
  workspaceRepository,
  workspaceMemberRepository,
  companyOnWorkspaceRepository,
  fieldRepository,
  productionUnitRepository,
);
const companyDeletionController = new CompanyDeletionController(deleteCompaniesWithAllDataUseCase);

/**
 * @swagger
 * /companies:
 *   get:
 *     summary: Elenca le aziende dell'utente autenticato
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: workspaceId
 *         schema:
 *           type: string
 *         description: When provided, returns companies scoped to the workspace assignments
 *     responses:
 *       200:
 *         description: Lista aziende
 *       401:
 *         description: Non autorizzato
 */
companyRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.listForCurrentUser(req, res)),
);

/**
 * @swagger
 * /companies:
 *   post:
 *     summary: Crea una nuova azienda
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - vatNumber
 *               - fiscalCode
 *               - nation
 *               - city
 *               - address
 *               - cap
 *               - email
 *               - phoneNumber
 *               - website
 *               - logoUrl
 *             properties:
 *               name:
 *                 type: string
 *               vatNumber:
 *                 type: string
 *               fiscalCode:
 *                 type: string
 *               nation:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               cap:
 *                 type: string
 *               email:
 *                 type: string
 *                 format: email
 *               phoneNumber:
 *                 type: string
 *               website:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               kind:
 *                 type: string
 *                 enum: [AGRICULTURAL, MANUFACTURING]
 *                 default: AGRICULTURAL
 *               workspaceId:
 *                 type: string
 *                 format: uuid
 *                 description: Optional workspace context; company kind must match workspace kind when provided
 *     responses:
 *       201:
 *         description: Azienda creata con successo
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 *       409:
 *         description: Azienda già esistente
 */
companyRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.create(req, res)),
);

/**
 * @swagger
 * /companies/bulk:
 *   post:
 *     summary: Crea più aziende in un'unica chiamata
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companies
 *             properties:
 *               companies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - vatNumber
 *                     - fiscalCode
 *                     - nation
 *                     - city
 *                     - address
 *                     - cap
 *                     - email
 *                     - phoneNumber
 *                     - website
 *                     - logoUrl
 *                   properties:
 *                     name: { type: string }
 *                     vatNumber: { type: string }
 *                     fiscalCode: { type: string }
 *                     nation: { type: string }
 *                     city: { type: string }
 *                     address: { type: string }
 *                     cap: { type: string }
 *                     email: { type: string, format: email }
 *                     phoneNumber: { type: string }
 *                     website: { type: string }
 *                     logoUrl: { type: string }
 *                     ownerId: { type: string, nullable: true }
 *     responses:
 *       201:
 *         description: Numero di aziende create
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 */
companyRouter.post(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.createBulk(req, res)),
);

/**
 * @swagger
 * /companies/{id}:
 *   get:
 *     summary: Ottiene un'azienda per ID
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Azienda trovata
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */
companyRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.findById(req, res)),
);

/**
 * @swagger
 * /companies/bulk:
 *   put:
 *     summary: Aggiorna più aziende in bulk
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companies
 *             properties:
 *               companies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - id
 *                   properties:
 *                     id:
 *                       type: string
 *                     name:
 *                       type: string
 *                     vatNumber:
 *                       type: string
 *                     fiscalCode:
 *                       type: string
 *                     nation:
 *                       type: string
 *                     city:
 *                       type: string
 *                     address:
 *                       type: string
 *                     cap:
 *                       type: string
 *                     email:
 *                       type: string
 *                       format: email
 *                     phoneNumber:
 *                       type: string
 *                     website:
 *                       type: string
 *                     logoUrl:
 *                       type: string
 *     responses:
 *       200:
 *         description: Aziende aggiornate con successo
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 */
companyRouter.put(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.updateBulk(req, res)),
);

/**
 * @swagger
 * /companies/{id}:
 *   put:
 *     summary: Aggiorna un'azienda
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               vatNumber:
 *                 type: string
 *               fiscalCode:
 *                 type: string
 *               nation:
 *                 type: string
 *               city:
 *                 type: string
 *               address:
 *                 type: string
 *               cap:
 *                 type: string
 *               email:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               website:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *     responses:
 *       200:
 *         description: Azienda aggiornata con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 *       409:
 *         description: Conflitto (VAT o Fiscal Code duplicato)
 */
companyRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.update(req, res)),
);

/**
 * @swagger
 * /companies/{id}:
 *   delete:
 *     summary: Elimina un'azienda
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Azienda eliminata con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */
companyRouter.delete(
  '/:id',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN], 'id'),
  asyncHandler((req, res) => companyController.delete(req, res)),
);

/**
 * @swagger
 * /companies/bulk/all:
 *   delete:
 *     summary: Elimina più aziende e tutti i dati correlati in bulk
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - companyIds
 *             properties:
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Aziende e tutti i dati correlati eliminati con successo
 *       400:
 *         description: Dati mancanti o non validi
 *       401:
 *         description: Non autorizzato
 */
companyRouter.delete(
  '/bulk/all',
  ensureAuthenticated,
  ensureCompanyIdsRole([CompanyRole.ADMIN]),
  asyncHandler((req, res) => companyDeletionController.deleteBulk(req, res)),
);

/**
 * @swagger
 * /companies/{id}/all:
 *   delete:
 *     summary: Elimina un'azienda e tutti i dati correlati (campi, unità produttive, prodotti, dosaggi, ecc.)
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Azienda e tutti i dati correlati eliminati con successo
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */
companyRouter.delete(
  '/:id/all',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN], 'id'),
  asyncHandler((req, res) => companyDeletionController.deleteOne(req, res)),
);

/**
 * @swagger
 * /companies/extract-from-csv:
 *   post:
 *     summary: Estrae dati azienda, campi e unità produttive da un file CSV/Excel
 *     description: Se companyId è fornito nel body, usa l'azienda esistente e salta l'estrazione company
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: File CSV o Excel con dati catastali e colturali
 *               companyId:
 *                 type: string
 *                 description: (Opzionale) ID dell'azienda esistente. Se fornito, salta l'estrazione company e usa questa azienda
 *     responses:
 *       200:
 *         description: Dati estratti con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: object
 *                       properties:
 *                         name:
 *                           type: string
 *                         vatNumber:
 *                           type: string
 *                         fiscalCode:
 *                           type: string
 *                         cuaa:
 *                           type: string
 *                         nation:
 *                           type: string
 *                         region:
 *                           type: string
 *                         city:
 *                           type: string
 *                         address:
 *                           type: string
 *                         cap:
 *                           type: string
 *                     fields:
 *                       type: array
 *                       items:
 *                         type: object
 *                     productionUnits:
 *                       type: array
 *                       items:
 *                         type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         fieldsCount:
 *                           type: number
 *                         productionUnitsCount:
 *                           type: number
 *       400:
 *         description: File mancante
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore di estrazione
 */
companyRouter.post(
  '/extract-from-csv',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => companyController.extractFromCsv(req, res)),
);

/**
 * @swagger
 * /companies/extract-from-visura:
 *   post:
 *     summary: Estrae i dati anagrafici di un'azienda da una visura camerale PDF
 *     description: Restituisce i dati estratti senza persisterli. L'utente li conferma con POST /companies.
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Dati estratti dalla visura
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     extracted:
 *                       type: object
 *                       properties:
 *                         name: { type: string, nullable: true }
 *                         vatNumber: { type: string, nullable: true }
 *                         fiscalCode: { type: string, nullable: true }
 *                         address: { type: string, nullable: true }
 *                         city: { type: string, nullable: true }
 *                         cap: { type: string, nullable: true }
 *                         nation: { type: string, nullable: true }
 *                         email: { type: string, nullable: true }
 *                         phoneNumber: { type: string, nullable: true }
 *                         website: { type: string, nullable: true }
 *       400:
 *         description: File mancante o non valido
 *       401:
 *         description: Non autorizzato
 *       500:
 *         description: Errore di estrazione
 */
companyRouter.post(
  '/extract-from-visura',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => companyController.extractFromVisura(req, res)),
);

/**
 * @swagger
 * /companies/create-with-data:
 *   post:
 *     summary: Crea un'azienda con campi e unità produttive in una singola operazione
 *     tags: [Companies]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - company
 *             properties:
 *               company:
 *                 type: object
 *                 required:
 *                   - name
 *                 properties:
 *                   name:
 *                     type: string
 *                   vatNumber:
 *                     type: string
 *                   fiscalCode:
 *                     type: string
 *                   cuaa:
 *                     type: string
 *                   nation:
 *                     type: string
 *                   region:
 *                     type: string
 *                   city:
 *                     type: string
 *                   address:
 *                     type: string
 *                   cap:
 *                     type: string
 *               fields:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     foglio:
 *                       type: string
 *                     particella:
 *                       type: string
 *                     superficieCatastaleMq:
 *                       type: number
 *               productionUnits:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     name:
 *                       type: string
 *                     areaHa:
 *                       type: number
 *                     cycles:
 *                       type: array
 *                       items:
 *                         type: object
 *     responses:
 *       201:
 *         description: Azienda creata con tutti i dati
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: object
 *                     createdFieldsCount:
 *                       type: number
 *                     createdProductionUnitsCount:
 *                       type: number
 *                     message:
 *                       type: string
 *       400:
 *         description: Dati mancanti
 *       401:
 *         description: Non autorizzato
 */
companyRouter.post(
  '/create-with-data',
  ensureAuthenticated,
  asyncHandler((req, res) => companyController.createWithData(req, res)),
);

export { companyRouter };
