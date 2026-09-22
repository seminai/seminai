import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { FileService } from '../../../infrastructure/services/FileService';
import { User } from '../../../domain/entities/User';

export interface UploadUserProfilePictureDTO {
  userId: string;
  file: Express.Multer.File;
}

export class UploadUserProfilePictureUseCase {
  constructor(private readonly userRepository: IUserRepository) {}

  async execute({ userId, file }: UploadUserProfilePictureDTO): Promise<User> {
    if (!file) {
      throw AppError.badRequest('Missing file', 'MISSING_FILE');
    }

    const existing = await this.userRepository.findById(userId);
    if (!existing) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const fileService = new FileService();
    const path = 'profilePicture';
    const publicUrl = await fileService.uploadFile(file, userId, path, 'profile');

    const updated = await this.userRepository.update(userId, { profilePictureUrl: publicUrl });
    return updated;
  }
}
