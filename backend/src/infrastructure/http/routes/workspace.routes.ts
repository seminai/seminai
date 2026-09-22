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

workspaceRouter.get(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.list(req, res)),
);

workspaceRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.create(req, res)),
);

workspaceRouter.get(
  '/invitations/pending',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.listPendingInvitations(req, res)),
);

workspaceRouter.post(
  '/invitations/:token/accept',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.acceptInvitation(req, res)),
);

workspaceRouter.delete(
  '/:id/invitations/:invitationId',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.deleteInvitation(req, res)),
);

workspaceRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.findById(req, res)),
);

workspaceRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.update(req, res)),
);

workspaceRouter.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.delete(req, res)),
);

workspaceRouter.get(
  '/:id/members',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.listMembers(req, res)),
);

workspaceRouter.get(
  '/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.listCompanies(req, res)),
);

workspaceRouter.put(
  '/:id/companies',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.replaceCompanies(req, res)),
);

workspaceRouter.post(
  '/:id/invite',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.inviteMember(req, res)),
);

workspaceRouter.put(
  '/:id/members/:memberId',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.updateMember(req, res)),
);

workspaceRouter.delete(
  '/:id/members/:memberId',
  ensureAuthenticated,
  asyncHandler((req, res) => workspaceController.removeMember(req, res)),
);

workspaceRouter.post(
  '/:id/logo',
  ensureAuthenticated,
  upload.single('logo'),
  asyncHandler((req, res) => workspaceController.uploadLogoAndExtractColors(req, res)),
);

export { workspaceRouter };
