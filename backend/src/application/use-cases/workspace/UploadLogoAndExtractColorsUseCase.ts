import { Workspace } from '../../../domain/entities/Workspace';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { ColorExtractionService } from '../../../infrastructure/services/ColorExtractionService';
import { FileService } from '../../../infrastructure/services/FileService';
import { AppError } from '../../../domain/errors/AppError';
import { MulterFile } from '../../../infrastructure/services/Multer';

interface UploadLogoRequest {
  workspaceId: string;
  userId: string;
  file: MulterFile;
}

interface UploadLogoResult {
  workspace: Workspace;
  extractedColors: {
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
  };
  logoUrl: string;
}

export class UploadLogoAndExtractColorsUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
    private colorExtractionService: ColorExtractionService,
    private fileService: FileService,
  ) {}

  async execute(request: UploadLogoRequest): Promise<UploadLogoResult> {
    const { workspaceId, userId, file } = request;

    // Verifica che l'utente sia admin del workspace
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.isAdmin()) {
      throw AppError.forbidden('Only admins can upload workspace logo', 'NOT_ADMIN');
    }

    // Verifica che il workspace esista
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }

    // Verifica che il file sia un'immagine
    if (!file.mimetype.startsWith('image/')) {
      throw AppError.badRequest('File must be an image', 'INVALID_FILE_TYPE');
    }

    // Carica il logo su Cloud Storage
    const path = `workspaces/${workspaceId}/logo`;
    const logoUrl = await this.fileService.uploadFile(file, userId, path, 'logo');

    // Estrai i colori dall'immagine
    const extractedColors = await this.colorExtractionService.extractColors(file.buffer);

    // Aggiorna il workspace con logoUrl e colori estratti
    const updatedWorkspace = await this.workspaceRepository.update(workspaceId, {
      logoUrl,
      primaryColor: extractedColors.primaryColor,
      secondaryColor: extractedColors.secondaryColor,
      accentColor: extractedColors.accentColor,
    });

    return {
      workspace: updatedWorkspace,
      extractedColors,
      logoUrl,
    };
  }
}
