import { Router } from 'express';
import { WorkspaceController } from '../controllers/WorkspaceController';
import { PrismaWorkspaceRepository } from '../../repositories/PrismaWorkspaceRepository';
import { PrismaWorkspaceMemberRepository } from '../../repositories/PrismaWorkspaceMemberRepository';
import { PrismaWorkspaceInvitationRepository } from '../../repositories/PrismaWorkspaceInvitationRepository';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { CreateWorkspaceUseCase } from '../../../application/use-cases/workspace/CreateWorkspaceUseCase';
import { GetWorkspaceUseCase } from '../../../application/use-cases/workspace/GetWorkspaceUseCase';
import { ListUserWorkspacesUseCase } from '../../../application/use-cases/workspace/ListUserWorkspacesUseCase';
import { UpdateWorkspaceUseCase } from '../../../application/use-cases/workspace/UpdateWorkspaceUseCase';
import { DeleteWorkspaceUseCase } from '../../../application/use-cases/workspace/DeleteWorkspaceUseCase';
import { InviteMemberUseCase } from '../../../application/use-cases/workspace/InviteMemberUseCase';
import { AcceptInvitationUseCase } from '../../../application/use-cases/workspace/AcceptInvitationUseCase';
import { RemoveMemberUseCase } from '../../../application/use-cases/workspace/RemoveMemberUseCase';
import { UpdateMemberUseCase } from '../../../application/use-cases/workspace/UpdateMemberUseCase';
import { ListWorkspaceMembersUseCase } from '../../../application/use-cases/workspace/ListWorkspaceMembersUseCase';
import { UploadLogoAndExtractColorsUseCase } from '../../../application/use-cases/workspace/UploadLogoAndExtractColorsUseCase';
import { ListUserPendingInvitationsUseCase } from '../../../application/use-cases/workspace/ListUserPendingInvitationsUseCase';
import { DeleteInvitationUseCase } from '../../../application/use-cases/workspace/DeleteInvitationUseCase';
import { ListWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ListWorkspaceCompaniesUseCase';
import { ReplaceWorkspaceCompaniesUseCase } from '../../../application/use-cases/workspace/ReplaceWorkspaceCompaniesUseCase';
import { PrismaCompanyRepository } from '../../repositories/PrismaCompanyRepository';
import { PrismaCompanyOnWorkspaceRepository } from '../../repositories/PrismaCompanyOnWorkspaceRepository';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { ColorExtractionService } from '../../services/ColorExtractionService';
import { FileService } from '../../services/FileService';
import { prisma } from '../../repositories/Prisma';

const workspaceRouter = Router();

// Repositories
const workspaceRepository = new PrismaWorkspaceRepository(prisma);
const workspaceMemberRepository = new PrismaWorkspaceMemberRepository(prisma);
const workspaceInvitationRepository = new PrismaWorkspaceInvitationRepository(prisma);
const userRepository = new PrismaUserRepository(prisma);
const companyRepository = new PrismaCompanyRepository(prisma);
const companyOnWorkspaceRepository = new PrismaCompanyOnWorkspaceRepository(prisma);

// Use Cases
const createWorkspaceUseCase = new CreateWorkspaceUseCase(
  workspaceRepository,
  workspaceMemberRepository,
  companyOnWorkspaceRepository,
  companyRepository,
);
const getWorkspaceUseCase = new GetWorkspaceUseCase(workspaceRepository, workspaceMemberRepository);
const listUserWorkspacesUseCase = new ListUserWorkspacesUseCase(workspaceRepository);
const updateWorkspaceUseCase = new UpdateWorkspaceUseCase(
  workspaceRepository,
  workspaceMemberRepository,
);
const deleteWorkspaceUseCase = new DeleteWorkspaceUseCase(
  workspaceRepository,
  workspaceMemberRepository,
);
const inviteMemberUseCase = new InviteMemberUseCase(
  workspaceRepository,
  workspaceMemberRepository,
  workspaceInvitationRepository,
  userRepository,
);
const acceptInvitationUseCase = new AcceptInvitationUseCase(
  workspaceRepository,
  workspaceMemberRepository,
  workspaceInvitationRepository,
  userRepository,
);
const removeMemberUseCase = new RemoveMemberUseCase(workspaceMemberRepository);
const updateMemberUseCase = new UpdateMemberUseCase(workspaceMemberRepository);
const listWorkspaceMembersUseCase = new ListWorkspaceMembersUseCase(
  workspaceMemberRepository,
  workspaceInvitationRepository,
  userRepository,
);
const listUserPendingInvitationsUseCase = new ListUserPendingInvitationsUseCase(
  workspaceInvitationRepository,
  workspaceRepository,
  userRepository,
);
const deleteInvitationUseCase = new DeleteInvitationUseCase(
  workspaceMemberRepository,
  workspaceInvitationRepository,
);
const listWorkspaceCompaniesUseCase = new ListWorkspaceCompaniesUseCase(
  companyOnWorkspaceRepository,
  workspaceMemberRepository,
);
const replaceWorkspaceCompaniesUseCase = new ReplaceWorkspaceCompaniesUseCase(
  companyOnWorkspaceRepository,
  companyRepository,
  workspaceRepository,
  workspaceMemberRepository,
);

// Services
const colorExtractionService = new ColorExtractionService();
const fileService = new FileService();

// Use Cases
const uploadLogoAndExtractColorsUseCase = new UploadLogoAndExtractColorsUseCase(
  workspaceRepository,
  workspaceMemberRepository,
  colorExtractionService,
  fileService,
);

// Controller
const workspaceController = new WorkspaceController(
  createWorkspaceUseCase,
  getWorkspaceUseCase,
  listUserWorkspacesUseCase,
  updateWorkspaceUseCase,
  deleteWorkspaceUseCase,
  inviteMemberUseCase,
  acceptInvitationUseCase,
  removeMemberUseCase,
  updateMemberUseCase,
  listWorkspaceMembersUseCase,
  uploadLogoAndExtractColorsUseCase,
  listUserPendingInvitationsUseCase,
  deleteInvitationUseCase,
  listWorkspaceCompaniesUseCase,
  replaceWorkspaceCompaniesUseCase,
);

/**
 * @swagger
 * tags:
 *   name: Workspaces
 *   description: Gestione workspace e membri
 */

/**
 * @swagger
 * /workspaces:
 *   get:
 *     summary: Elenca i workspace dell'utente autenticato
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista workspace
 */
workspaceRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.list(req, res)),
);

/**
 * @swagger
 * /workspaces:
 *   post:
 *     summary: Crea un nuovo workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - kind
 *             properties:
 *               name:
 *                 type: string
 *               kind:
 *                 type: string
 *                 enum: [AGRICULTURAL, MANUFACTURING]
 *               slug:
 *                 type: string
 *               description:
 *                 type: string
 *               logoUrl:
 *                 type: string
 *               iconUrl:
 *                 type: string
 *               primaryColor:
 *                 type: string
 *               secondaryColor:
 *                 type: string
 *               accentColor:
 *                 type: string
 *               plan:
 *                 type: string
 *                 enum: [FREE, PROFESSIONAL, ENTERPRISE]
 *               enabledModules:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [DCA, LABELS]
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Optional companies to assign to the workspace at creation
 *     responses:
 *       201:
 *         description: Workspace creato
 */
workspaceRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.create(req, res)),
);

/**
 * @swagger
 * /workspaces/invitations/pending:
 *   get:
 *     summary: Elenca gli inviti pendenti dell'utente autenticato
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista inviti pendenti con dettagli workspace
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
 *                     invitations:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           workspaceId:
 *                             type: string
 *                           email:
 *                             type: string
 *                           role:
 *                             type: string
 *                           token:
 *                             type: string
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                           workspace:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                               name:
 *                                 type: string
 *                               slug:
 *                                 type: string
 *                               logoUrl:
 *                                 type: string
 */
workspaceRouter.get(
  '/invitations/pending',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.listPendingInvitations(req, res)),
);

/**
 * @swagger
 * /workspaces/invitations/{token}/accept:
 *   post:
 *     summary: Accetta un invito al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Invito accettato
 */
workspaceRouter.post(
  '/invitations/:token/accept',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.acceptInvitation(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/invitations/{invitationId}:
 *   delete:
 *     summary: Elimina un invito al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: invitationId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Invito eliminato
 */
workspaceRouter.delete(
  '/:id/invitations/:invitationId',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.deleteInvitation(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}:
 *   get:
 *     summary: Ottiene un workspace per ID
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workspace trovato
 */
workspaceRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.findById(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}:
 *   put:
 *     summary: Aggiorna un workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Workspace aggiornato
 */
workspaceRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.update(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}:
 *   delete:
 *     summary: Elimina un workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Workspace eliminato
 */
workspaceRouter.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.delete(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/members:
 *   get:
 *     summary: Elenca i membri del workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista membri
 */
workspaceRouter.get(
  '/:id/members',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.listMembers(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/companies:
 *   get:
 *     summary: Elenca le aziende assegnate al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Lista aziende assegnate
 */
workspaceRouter.get(
  '/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.listCompanies(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/companies:
 *   put:
 *     summary: Sostituisce le aziende assegnate al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
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
 *               - companyIds
 *             properties:
 *               companyIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Assegnazioni aggiornate
 */
workspaceRouter.put(
  '/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.replaceCompanies(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/invite:
 *   post:
 *     summary: Invita un membro al workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
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
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *               role:
 *                 type: string
 *                 enum: [ADMIN, MEMBER, VIEWER]
 *     responses:
 *       201:
 *         description: Invito creato
 */
workspaceRouter.post(
  '/:id/invite',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.inviteMember(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/members/{memberId}:
 *   put:
 *     summary: Aggiorna ruolo/permessi di un membro
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Membro aggiornato
 */
workspaceRouter.put(
  '/:id/members/:memberId',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.updateMember(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/members/{memberId}:
 *   delete:
 *     summary: Rimuove un membro dal workspace
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: memberId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Membro rimosso
 */
workspaceRouter.delete(
  '/:id/members/:memberId',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.removeMember(req, res)),
);

/**
 * @swagger
 * /workspaces/{id}/logo:
 *   post:
 *     summary: Carica un logo e estrae automaticamente i colori per il template
 *     tags: [Workspaces]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - logo
 *             properties:
 *               logo:
 *                 type: string
 *                 format: binary
 *                 description: File immagine del logo (PNG, JPG, etc.)
 *     responses:
 *       200:
 *         description: Logo caricato e colori estratti
 */
workspaceRouter.post(
  '/:id/logo',
  ensureAuthenticated,
  upload.single('logo'),
  asyncHandler((req, res) => workspaceController.uploadLogoAndExtractColors(req, res)),
);

export { workspaceRouter };
