import bcrypt from 'bcryptjs';
import { UserOnCompany } from '../../../domain/entities/UserOnCompany';
import { User } from '../../../domain/entities/User';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { CompanyRole, UserRole } from '@prisma/client';
import { AppError } from '../../../domain/errors/AppError';
import { EmailService } from '../../../infrastructure/services/EmailService';
import { isPendingActivation } from '../../utils/user-activation';
import { generateTemporaryPassword } from '../../utils/temporary-password';

interface AddUserToCompanyDTO {
  companyId: string;
  email: string;
  name: string;
  role: CompanyRole;
  invitedBy: string;
}

export class AddUserToCompanyUseCase {
  private emailService: EmailService;

  constructor(
    private userOnCompanyRepository: IUserOnCompanyRepository,
    private companyRepository: ICompanyRepository,
    private userRepository: IUserRepository,
  ) {
    this.emailService = EmailService.getInstance();
  }

  async execute(data: AddUserToCompanyDTO): Promise<UserOnCompany> {
    const company = await this.companyRepository.findById(data.companyId);
    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }
    const normalizedEmail = data.email.toLowerCase();
    let user = await this.userRepository.findByEmail(normalizedEmail);
    if (user) {
      const existingRelation = await this.userOnCompanyRepository.findByCompanyAndUser(
        data.companyId,
        user.id,
      );
      if (existingRelation) {
        throw AppError.conflict('User already belongs to this company', 'USER_ALREADY_IN_COMPANY');
      }
      await this.sendExistingUserEmail({
        user,
        companyId: data.companyId,
        companyName: company.name,
        invitedBy: data.invitedBy,
        role: data.role,
      });
    } else {
      const temporaryPassword = generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 8);
      user = User.create({
        email: normalizedEmail,
        password: hashedPassword,
        name: data.name,
        surname: null,
        fiscalCode: null,
        companyName: null,
        vatNumber: null,
        phoneNumber: null,
        address: null,
        profilePictureUrl: null,
        role: UserRole.BASIC,
        credits: 10,
      });
      user = await this.userRepository.create(user);
      await this.sendInvitationEmail({
        user,
        temporaryPassword,
        invitedBy: data.invitedBy,
        companyId: data.companyId,
        companyName: company.name,
      });
    }
    const userOnCompany = UserOnCompany.create({
      companyId: data.companyId,
      userId: user.id,
      type: null,
      role: data.role,
    });
    return await this.userOnCompanyRepository.create(userOnCompany);
  }

  private async sendExistingUserEmail(data: {
    readonly user: User;
    readonly companyId: string;
    readonly companyName: string;
    readonly invitedBy: string;
    readonly role: CompanyRole;
  }): Promise<void> {
    if (isPendingActivation(data.user)) {
      const temporaryPassword = generateTemporaryPassword();
      const hashedPassword = await bcrypt.hash(temporaryPassword, 8);
      const updatedUser = await this.userRepository.update(data.user.id, {
        password: hashedPassword,
      });
      await this.sendInvitationEmail({
        user: updatedUser,
        temporaryPassword,
        invitedBy: data.invitedBy,
        companyId: data.companyId,
        companyName: data.companyName,
      });
      return;
    }
    try {
      await this.emailService.sendUserAddedToCompanyEmail(
        data.user.email,
        data.user.name,
        data.companyId,
        data.companyName,
        data.invitedBy,
        data.role,
      );
    } catch (_) {
      // Best-effort email: do not block adding the user when email delivery fails.
    }
  }

  private async sendInvitationEmail(data: {
    readonly user: User;
    readonly temporaryPassword: string;
    readonly invitedBy: string;
    readonly companyId: string;
    readonly companyName: string;
  }): Promise<void> {
    try {
      await this.emailService.sendInvitationEmail(
        data.user.email,
        data.user.name,
        data.temporaryPassword,
        data.invitedBy,
        data.companyId,
        data.companyName,
      );
    } catch (_) {
      // Best-effort email: do not block adding the user when email delivery fails.
    }
  }
}
