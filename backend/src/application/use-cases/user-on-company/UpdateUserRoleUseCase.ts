import { UserOnCompany } from '../../../domain/entities/UserOnCompany';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { CompanyRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';

interface UpdateUserRoleDTO {
  userOnCompanyId: string;
  role: CompanyRole;
}

export class UpdateUserRoleUseCase {
  constructor(private userOnCompanyRepository: IUserOnCompanyRepository) {}

  async execute(data: UpdateUserRoleDTO): Promise<UserOnCompany> {
    const existingRelation = await this.userOnCompanyRepository.findById(data.userOnCompanyId);
    if (!existingRelation) {
      throw AppError.notFound('User-Company relationship not found', 'RELATION_NOT_FOUND');
    }

    return await this.userOnCompanyRepository.update(data.userOnCompanyId, { role: data.role });
  }
}
