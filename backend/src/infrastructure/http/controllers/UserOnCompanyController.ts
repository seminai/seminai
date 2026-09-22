import { Request, Response } from 'express';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { CompanyRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { AddUserToCompanyUseCase } from '../../../application/use-cases/user-on-company/AddUserToCompanyUseCase';
import { UpdateUserRoleUseCase } from '../../../application/use-cases/user-on-company/UpdateUserRoleUseCase';
import { RemoveUserFromCompanyUseCase } from '../../../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase';
import { ResendCompanyInvitationUseCase } from '../../../application/use-cases/user-on-company/ResendCompanyInvitationUseCase';

export class UserOnCompanyController {
  constructor(
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly userRepository: IUserRepository,
    private readonly addUserToCompanyUseCase: AddUserToCompanyUseCase,
    private readonly updateUserRoleUseCase: UpdateUserRoleUseCase,
    private readonly removeUserFromCompanyUseCase: RemoveUserFromCompanyUseCase,
    private readonly resendCompanyInvitationUseCase: ResendCompanyInvitationUseCase,
  ) {}

  async addUserToCompany(request: Request, response: Response): Promise<Response> {
    const { companyId, email, name, role } = request.body;

    if (!companyId || !email || !name || !role) {
      throw AppError.badRequest(
        'Missing required fields: companyId, email, name, role',
        'MISSING_FIELDS',
      );
    }

    if (!Object.values(CompanyRole).includes(role)) {
      throw AppError.badRequest('Invalid role', 'INVALID_ROLE');
    }

    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }

    const invitedByName =
      (request.user as { id: string; name?: string; email?: string }).name || 'Unknown';

    const created = await this.addUserToCompanyUseCase.execute({
      companyId,
      email,
      name,
      role,
      invitedBy: invitedByName,
    });

    return response.status(201).json({
      status: 'success',
      data: { userOnCompany: created },
    });
  }

  async getUsersByCompany(request: Request, response: Response): Promise<Response> {
    const { companyId } = request.params;

    const company = await this.companyRepository.findById(companyId);
    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }

    const usersOnCompany = await this.userOnCompanyRepository.findByCompanyIdWithDetails(companyId);

    return response.json({
      status: 'success',
      data: { users: usersOnCompany },
    });
  }

  async getCompaniesByUser(request: Request, response: Response): Promise<Response> {
    const { userId } = request.params;

    const user = await this.userRepository.findById(userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }

    const companiesOfUser = await this.userOnCompanyRepository.findByUserIdWithDetails(userId);

    return response.json({
      status: 'success',
      data: { companies: companiesOfUser },
    });
  }

  async updateUserRole(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const { role } = request.body;

    if (!role) {
      throw AppError.badRequest('Role is required', 'MISSING_ROLE');
    }

    if (!Object.values(CompanyRole).includes(role)) {
      throw AppError.badRequest('Invalid role', 'INVALID_ROLE');
    }

    const updated = await this.updateUserRoleUseCase.execute({
      userOnCompanyId: id,
      role,
    });

    return response.json({
      status: 'success',
      data: { userOnCompany: updated },
    });
  }

  async removeUserFromCompany(request: Request, response: Response): Promise<Response> {
    const { companyId, userId } = request.params;

    await this.removeUserFromCompanyUseCase.execute({
      companyId,
      userId,
    });

    return response.status(204).send();
  }

  async resendInvitation(request: Request, response: Response): Promise<Response> {
    const { companyId, userId } = request.params;
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'NOT_AUTHENTICATED');
    }
    const invitedByName =
      (request.user as { id: string; name?: string; email?: string }).name || 'Unknown';
    await this.resendCompanyInvitationUseCase.execute({
      companyId,
      userId,
      invitedBy: invitedByName,
    });
    return response.json({
      status: 'success',
      message: 'Invitation resent successfully',
    });
  }
}
