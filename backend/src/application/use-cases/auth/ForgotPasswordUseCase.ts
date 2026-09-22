import jwt from 'jsonwebtoken';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { EmailService } from '../../../infrastructure/services/EmailService';

interface ForgotPasswordDTO {
  email: string;
}

export class ForgotPasswordUseCase {
  private emailService: EmailService;

  constructor(private userRepository: IUserRepository) {
    this.emailService = EmailService.getInstance();
  }

  async execute({ email }: ForgotPasswordDTO): Promise<void> {
    const user = await this.userRepository.findByEmail(email);

    // Always return silently even if user not found (prevents email enumeration)
    if (!user) {
      return;
    }

    const resetToken = jwt.sign(
      {
        userId: user.id,
        type: 'password_reset',
      },
      process.env.JWT_SECRET || 'default_secret',
      {
        expiresIn: '1h',
      },
    );

    try {
      await this.emailService.sendPasswordResetEmail(user.email, user.name, resetToken);
    } catch (_) {
      // Silent fail - do not leak whether email was sent
    }
  }
}
