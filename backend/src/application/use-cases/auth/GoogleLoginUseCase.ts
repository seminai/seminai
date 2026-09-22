import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { User } from '../../../domain/entities/User';
import { AppError } from '../../../domain/errors/AppError';
import { UserRole } from '@prisma/client';

interface GoogleLoginDTO {
  idToken: string;
}

interface GoogleLoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    credits: number;
  };
}

export class GoogleLoginUseCase {
  private client: OAuth2Client | undefined;

  constructor(private userRepository: IUserRepository) {}

  private requireClient(): OAuth2Client {
    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      throw AppError.featureNotConfigured('Google login');
    }
    if (!this.client) {
      this.client = new OAuth2Client(clientId);
    }
    return this.client;
  }

  async execute({ idToken }: GoogleLoginDTO): Promise<GoogleLoginResponse> {
    const client = this.requireClient();
    let payload;
    try {
      const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (error) {
      throw AppError.unauthorized('Invalid Google ID token', 'INVALID_GOOGLE_TOKEN');
    }

    if (!payload || !payload.email) {
      throw AppError.unauthorized('Google token does not contain email', 'MISSING_GOOGLE_EMAIL');
    }

    const { sub: googleId, email, email_verified, name, picture } = payload;

    if (!email_verified) {
      throw AppError.unauthorized('Google email is not verified', 'GOOGLE_EMAIL_NOT_VERIFIED');
    }

    const normalizedEmail = email.toLowerCase();

    // Try to find user by googleId first (returning Google users)
    let user = await this.userRepository.findByGoogleId(googleId);

    if (!user) {
      // First-time Google login: find by email
      user = await this.userRepository.findByEmail(normalizedEmail);

      if (user) {
        // Link Google account to existing user
        user = await this.userRepository.update(user.id, { googleId });
      } else {
        // New user: register via Google
        const newUser = User.create({
          email: normalizedEmail,
          password: null,
          name: name || normalizedEmail.split('@')[0],
          surname: null,
          fiscalCode: null,
          companyName: null,
          vatNumber: null,
          phoneNumber: null,
          address: null,
          profilePictureUrl: picture || null,
          role: UserRole.BASIC,
          credits: 10,
          googleId,
        });
        user = await this.userRepository.create(newUser);
      }
    }

    if (user.isDeactivated) {
      throw AppError.forbidden('This account is deactivated', 'USER_DEACTIVATED');
    }

    if (user.isBlocked) {
      throw AppError.forbidden('This account is blocked', 'USER_BLOCKED');
    }

    const refreshedUser = await this.userRepository.update(user.id, {
      lastAccessAt: new Date(),
    });

    const token = jwt.sign(
      { userId: refreshedUser.id },
      process.env.JWT_SECRET || 'default_secret',
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
