import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { AppError } from '../../../domain/errors/AppError';

interface RemoveUserFromCompanyDTO {
  companyId: string;
  userId: string;
}

export class RemoveUserFromCompanyUseCase {
  constructor(private userOnCompanyRepository: IUserOnCompanyRepository) {}

  async execute(data: RemoveUserFromCompanyDTO): Promise<void> {
    const existingRelation = await this.userOnCompanyRepository.findByCompanyAndUser(
      data.companyId,
      data.userId,
    );
    if (!existingRelation) {
      throw AppError.notFound('User-Company relationship not found', 'RELATION_NOT_FOUND');
    }

    await this.userOnCompanyRepository.deleteByCompanyAndUser(data.companyId, data.userId);
  }
}
