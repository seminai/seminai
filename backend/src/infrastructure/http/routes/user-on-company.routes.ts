import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { UserOnCompanyController } from '../controllers/UserOnCompanyController';
import { PrismaUserOnCompanyRepository } from '../../repositories/PrismaUserOnCompanyRepository';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { AddUserToCompanyUseCase } from '../../../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { UpdateUserRoleUseCase } from '../../../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { RemoveUserFromCompanyUseCase } from '../../../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../../../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const userOnCompanyRouter = Router();
const userOnCompanyRepository = new PrismaUserOnCompanyRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const userRepository = new PrismaUserRepository(prisma);

const addUserToCompanyUseCase = new AddUserToCompanyUseCase(
  userOnCompanyRepository,
  companyRepository,
  userRepository,
);
const updateUserRoleUseCase = new UpdateUserRoleUseCase(userOnCompanyRepository);
const removeUserFromCompanyUseCase = new RemoveUserFromCompanyUseCase(userOnCompanyRepository);
const resendCompanyInvitationUseCase = new ResendCompanyInvitationUseCase(
  userOnCompanyRepository,
  companyRepository,
  userRepository,
);

const userOnCompanyController = new UserOnCompanyController(
  userOnCompanyRepository,
  companyRepository,
  userRepository,
  addUserToCompanyUseCase,
  updateUserRoleUseCase,
  removeUserFromCompanyUseCase,
  resendCompanyInvitationUseCase,
);

/**
 * @swagger
 * /user-on-company:
 *   post:
 *     summary: Aggiunge o invita un utente a un'azienda con un ruolo specifico
 *     description: |
 *       Richiede ruolo ADMIN o EDITOR nell'azienda.
 *       Se l'utente esiste già, viene aggiunto all'azienda e riceve un'email di notifica.
 *       Se l'utente non esiste, viene creato con una password temporanea e riceve un'email di invito.
 *     tags: [UserOnCompany]
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
 *               - companyId
 *               - email
 *               - name
 *               - role
 *             properties:
 *               companyId:
 *                 type: string
 *                 description: ID dell'azienda
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Email dell'utente da aggiungere o invitare
 *               name:
 *                 type: string
 *                 description: Nome dell'utente (usato per creare nuovi utenti)
 *               role:
 *                 type: string
 *                 enum: [ADMIN, EDITOR, VIEWER]
 *                 description: Ruolo dell'utente nell'azienda
 *     responses:
 *       201:
 *         description: Utente aggiunto all'azienda con successo
 *       400:
 *         description: Dati mancanti o ruolo non valido
 *       401:
 *         description: Non autorizzato
 *       403:
 *         description: Permessi insufficienti (richiesto ADMIN o EDITOR)
 *       404:
 *         description: Azienda non trovata
 *       409:
 *         description: L'utente è già membro dell'azienda
 */
userOnCompanyRouter.post(
  '/',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR]),
  asyncHandler((req, res) => userOnCompanyController.addUserToCompany(req, res)),
);

/**
 * @swagger
 * /user-on-company/company/{companyId}:
 *   get:
 *     summary: Ottiene tutti gli utenti di un'azienda
 *     tags: [UserOnCompany]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista degli utenti dell'azienda
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Azienda non trovata
 */
userOnCompanyRouter.get(
  '/company/:companyId',
  ensureAuthenticated,
  asyncHandler((req, res) => userOnCompanyController.getUsersByCompany(req, res)),
);

/**
 * @swagger
 * /user-on-company/user/{userId}:
 *   get:
 *     summary: Ottiene tutte le aziende di un utente
 *     tags: [UserOnCompany]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista delle aziende dell'utente
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Utente non trovato
 */
userOnCompanyRouter.get(
  '/user/:userId',
  ensureAuthenticated,
  asyncHandler((req, res) => userOnCompanyController.getCompaniesByUser(req, res)),
);

/**
 * @swagger
 * /user-on-company/{id}/role:
 *   patch:
 *     summary: Aggiorna il ruolo di un utente in un'azienda
 *     description: Richiede ruolo ADMIN o EDITOR nell'azienda
 *     tags: [UserOnCompany]
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
 *             required:
 *               - role
 *               - companyId
 *             properties:
 *               role:
 *                 type: string
 *                 enum: [ADMIN, EDITOR, VIEWER]
 *               companyId:
 *                 type: string
 *                 description: ID dell'azienda (necessario per verifica permessi)
 *     responses:
 *       200:
 *         description: Ruolo aggiornato con successo
 *       400:
 *         description: Ruolo non valido
 *       401:
 *         description: Non autorizzato
 *       403:
 *         description: Permessi insufficienti (richiesto ADMIN o EDITOR)
 *       404:
 *         description: Relazione utente-azienda non trovata
 */
userOnCompanyRouter.patch(
  '/:id/role',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR]),
  asyncHandler((req, res) => userOnCompanyController.updateUserRole(req, res)),
);

/**
 * @swagger
 * /user-on-company/company/{companyId}/user/{userId}/resend-invitation:
 *   post:
 *     summary: Reinvia l'invito a un utente aziendale non ancora attivato
 *     description: Rigenera la password temporanea e reinvia l'email di invito.
 *     tags: [UserOnCompany]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invito reinviato con successo
 *       400:
 *         description: Utente già attivato o OAuth
 *       401:
 *         description: Non autorizzato
 *       403:
 *         description: Permessi insufficienti (richiesto ADMIN o EDITOR)
 *       404:
 *         description: Relazione utente-azienda non trovata
 */
userOnCompanyRouter.post(
  '/company/:companyId/user/:userId/resend-invitation',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR]),
  asyncHandler((req, res) => userOnCompanyController.resendInvitation(req, res)),
);

/**
 * @swagger
 * /user-on-company/company/{companyId}/user/{userId}:
 *   delete:
 *     summary: Rimuove un utente da un'azienda
 *     description: Richiede ruolo ADMIN o EDITOR nell'azienda
 *     tags: [UserOnCompany]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Utente rimosso dall'azienda con successo
 *       401:
 *         description: Non autorizzato
 *       403:
 *         description: Permessi insufficienti (richiesto ADMIN o EDITOR)
 *       404:
 *         description: Relazione utente-azienda non trovata
 */
userOnCompanyRouter.delete(
  '/company/:companyId/user/:userId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR]),
  asyncHandler((req, res) => userOnCompanyController.removeUserFromCompany(req, res)),
);

export { userOnCompanyRouter };
