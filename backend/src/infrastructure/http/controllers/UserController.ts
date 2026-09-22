import { Request, Response } from 'express';
import { UpdateUserProfileUseCase } from '../../../application/use-cases/user/UpdateUserProfileUseCase';
import { GetUserProfileUseCase } from '../../../application/use-cases/user/GetUserProfileUseCase';
import { UploadUserProfilePictureUseCase } from '../../../application/use-cases/user/UploadUserProfilePictureUseCase';
import { DeleteUserCacheUseCase } from '../../../application/use-cases/user/DeleteUserCacheUseCase';
import { DeleteAccountUseCase } from '../../../application/use-cases/user/DeleteAccountUseCase';
import { AppError } from '../../../domain/errors/AppError';
import { clearAdminAccessCookie, getSessionCookieBaseOptions } from '../utils/admin-access';

export class UserController {
  constructor(
    private readonly updateUserProfileUseCase: UpdateUserProfileUseCase,
    private readonly getUserProfileUseCase: GetUserProfileUseCase,
    private readonly uploadUserProfilePictureUseCase: UploadUserProfilePictureUseCase,
    private readonly deleteUserCacheUseCase: DeleteUserCacheUseCase,
    private readonly deleteAccountUseCase: DeleteAccountUseCase,
  ) {}

  async updateMe(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }

    const {
      name,
      surname,
      fiscalCode,
      companyName,
      vatNumber,
      phoneNumber,
      address,
      profilePictureUrl,
      qdcApiKey,
      ifarmingApiKey,
    } = request.body || {};

    const result = await this.updateUserProfileUseCase.execute({
      userId: request.user.id,
      data: {
        name,
        surname,
        fiscalCode,
        companyName,
        vatNumber,
        phoneNumber,
        address,
        profilePictureUrl,
        qdcApiKey,
        ifarmingApiKey,
      },
    });

    return response.status(200).json({
      status: 'success',
      data: {
        user: result.user,
        qdcApiKey: result.qdcApiKey,
        ifarmingApiKey: result.ifarmingApiKey,
      },
    });
  }

  async getMe(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }

    const result = await this.getUserProfileUseCase.execute({ userId: request.user.id });
    return response.status(200).json({
      status: 'success',
      data: {
        user: result.user,
        qdcApiKey: result.qdcApiKey,
        ifarmingApiKey: result.ifarmingApiKey,
      },
    });
  }

  async uploadProfilePicture(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    if (!request.file) {
      throw AppError.badRequest('Missing file', 'MISSING_FILE');
    }

    const updated = await this.uploadUserProfilePictureUseCase.execute({
      userId: request.user.id,
      file: request.file,
    });

    return response.status(200).json({
      status: 'success',
      data: { user: updated },
    });
  }

  async deleteUserCache(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }

    const result = await this.deleteUserCacheUseCase.execute({
      userId: request.user.id,
    });

    return response.status(200).json({
      status: 'success',
      data: {
        deletedCount: result.deletedCount,
      },
    });
  }

  async deleteMe(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    await this.deleteAccountUseCase.execute({ userId: request.user.id });
    response.clearCookie('auth_token', getSessionCookieBaseOptions(request));
    clearAdminAccessCookie(response, request);
    return response.status(200).json({
      status: 'success',
      message: 'Account deleted successfully',
    });
  }
}
