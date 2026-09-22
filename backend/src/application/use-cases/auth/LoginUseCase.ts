import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';
import { getJwtSecret } from '../../../utils/get-jwt-secret';

interface LoginDTO {
  email: string;
  password: string;
}

interface LoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    credits: number;
  };
}

export class LoginUseCase {
  constructor(private userRepository: IUserRepository) {}

  async execute({ email, password }: LoginDTO): Promise<LoginResponse> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw AppError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (!user.password) {
      throw AppError.unauthorized(
        'This account uses Google login. Please sign in with Google.',
        'GOOGLE_ONLY_ACCOUNT',
      );
    }

    if (user.isDeactivated) {
      throw AppError.forbidden('This account is deactivated', 'USER_DEACTIVATED');
    }

    if (user.isBlocked) {
      throw AppError.forbidden('This account is blocked', 'USER_BLOCKED');
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
      throw AppError.unauthorized('Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const refreshedUser = await this.userRepository.update(user.id, {
      lastAccessAt: new Date(),
    });

    const token = jwt.sign(
      {
        userId: refreshedUser.id,
      },
      getJwtSecret(),
      {
        expiresIn: '1d',
      },
    );

    return {
      token,
      user: {
        id: refreshedUser.id,
        email: refreshedUser.email,
        name: refreshedUser.name,
        role: refreshedUser.role,
        credits: refreshedUser.credits,
      },
    };
  }
}
