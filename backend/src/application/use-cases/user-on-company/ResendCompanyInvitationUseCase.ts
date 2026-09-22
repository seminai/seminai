import bcrypt from 'bcryptjs';
import { IUserOnCompanyRepository } from '../../../domain/repositories/IUserOnCompanyRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { EmailService } from '../../../infrastructure/services/EmailService';
import { isPendingActivation } from '../../utils/user-activation';
import { generateTemporaryPassword } from '../../utils/temporary-password';

interface ResendCompanyInvitationDTO {
  readonly companyId: string;
  readonly userId: string;
  readonly invitedBy: string;
}

/**
 * Resends company invitation credentials for local accounts that have never logged in.
 */
export class ResendCompanyInvitationUseCase {
  private readonly emailService: EmailService;

  constructor(
    private readonly userOnCompanyRepository: IUserOnCompanyRepository,
    private readonly companyRepository: ICompanyRepository,
    private readonly userRepository: IUserRepository,
  ) {
    this.emailService = EmailService.getInstance();
  }

  async execute(data: ResendCompanyInvitationDTO): Promise<void> {
    const relation = await this.userOnCompanyRepository.findByCompanyAndUser(
      data.companyId,
      data.userId,
    );
    if (!relation) {
      throw AppError.notFound('User-Company relationship not found', 'USER_COMPANY_NOT_FOUND');
    }
    const company = await this.companyRepository.findById(data.companyId);
    if (!company) {
      throw AppError.notFound('Company not found', 'COMPANY_NOT_FOUND');
    }
    const user = await this.userRepository.findById(data.userId);
    if (!user) {
      throw AppError.notFound('User not found', 'USER_NOT_FOUND');
    }
    if (user.googleId) {
      throw AppError.badRequest(
        'Cannot resend invitation to OAuth users',
        'CANNOT_RESEND_OAUTH_USER',
      );
    }
    if (!isPendingActivation(user)) {
      throw AppError.badRequest('User has already activated the account', 'USER_ALREADY_ACTIVATED');
    }
    const temporaryPassword = generateTemporaryPassword();
    const hashedPassword = await bcrypt.hash(temporaryPassword, 8);
    const updatedUser = await this.userRepository.update(user.id, { password: hashedPassword });
    try {
      await this.emailService.sendInvitationEmail(
        updatedUser.email,
        updatedUser.name,
        temporaryPassword,
        data.invitedBy,
        company.id,
        company.name,
      );
    } catch (_) {
      // Best-effort email: keep behavior aligned with the existing invitation flow.
    }
  }
}
