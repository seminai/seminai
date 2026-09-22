import jwt from 'jsonwebtoken';
import { IUserRepository } from '../../../domain/repositories/IUserRepository';
import { AppError } from '../../../domain/errors/AppError';

interface VerifyPhoneDTO {
  phoneNumber: string;
}

interface VerifyPhoneResponse {
  exists: boolean;
  userId?: string;
  userName?: string;
  email?: string;
  maskedEmail?: string;
}

interface SendOtpDTO {
  phoneNumber: string;
  telegramUserId: number;
}

interface SendOtpResponse {
  sent: boolean;
  maskedEmail: string;
  expiresIn: number;
}

interface VerifyOtpDTO {
  phoneNumber: string;
  otp: string;
  telegramUserId: number;
  telegramUsername?: string;
}

interface TelegramLoginResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: string;
    credits: number;
  };
}

// In-memory OTP storage (in production use Redis)
const otpStore: Map<string, { otp: string; expiresAt: number; telegramUserId: number }> = new Map();

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  const maskedLocal =
    localPart.length > 2
      ? localPart[0] + '*'.repeat(localPart.length - 2) + localPart[localPart.length - 1]
      : localPart[0] + '*';
  return `${maskedLocal}@${domain}`;
}

export class TelegramLoginUseCase {
  private emailService: {
    sendEmail: (to: string, subject: string, html: string) => Promise<void>;
  } | null = null;

  constructor(
    private userRepository: IUserRepository,
    emailService?: { sendEmail: (to: string, subject: string, html: string) => Promise<void> },
  ) {
    this.emailService = emailService || null;
  }

  async verifyPhone({ phoneNumber }: VerifyPhoneDTO): Promise<VerifyPhoneResponse> {
    const user = await this.userRepository.findByPhoneNumber(phoneNumber);

    if (!user) {
      return { exists: false };
    }

    return {
      exists: true,
      userId: user.id,
      userName: user.name,
      email: user.email,
      maskedEmail: maskEmail(user.email),
    };
  }

  async sendOtp({ phoneNumber, telegramUserId }: SendOtpDTO): Promise<SendOtpResponse> {
    const user = await this.userRepository.findByPhoneNumber(phoneNumber);

    if (!user) {
      throw AppError.unauthorized(
        'Phone number not associated with any account',
        'PHONE_NOT_FOUND',
      );
    }

    const otp = generateOtp();
    const expiresIn = 10 * 60 * 1000; // 10 minutes
    const expiresAt = Date.now() + expiresIn;

    // Store OTP
    otpStore.set(phoneNumber, { otp, expiresAt, telegramUserId });

    // Send email
    if (this.emailService) {
      await this.emailService.sendEmail(
        user.email,
        'Codice di verifica SeminAI Telegram',
        `
          <h2>Codice di verifica</h2>
          <p>Il tuo codice per accedere a SeminAI tramite Telegram è:</p>
          <h1 style="font-size: 32px; letter-spacing: 5px; color: #2563eb;">${otp}</h1>
          <p>Il codice scade tra 10 minuti.</p>
          <p>Se non hai richiesto questo codice, ignora questa email.</p>
        `,
      );
    } else {
      // For development/testing - log OTP to console
      console.log(`[TelegramOTP] Code for ${phoneNumber}: ${otp}`);
    }

    return {
      sent: true,
      maskedEmail: maskEmail(user.email),
      expiresIn: expiresIn / 1000,
    };
  }

  async verifyOtp({
    phoneNumber,
    otp,
    telegramUserId,
    telegramUsername: _telegramUsername,
  }: VerifyOtpDTO): Promise<TelegramLoginResponse> {
    const stored = otpStore.get(phoneNumber);

    if (!stored) {
      throw AppError.unauthorized('No OTP found. Please request a new code.', 'OTP_NOT_FOUND');
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(phoneNumber);
      throw AppError.unauthorized('OTP expired. Please request a new code.', 'OTP_EXPIRED');
    }

    if (stored.otp !== otp) {
      throw AppError.unauthorized('Invalid OTP code.', 'OTP_INVALID');
    }

    if (stored.telegramUserId !== telegramUserId) {
      throw AppError.unauthorized('Telegram user mismatch.', 'TELEGRAM_MISMATCH');
    }

    // OTP valid - delete it
    otpStore.delete(phoneNumber);

    const user = await this.userRepository.findByPhoneNumber(phoneNumber);

    if (!user) {
      throw AppError.unauthorized('User not found.', 'USER_NOT_FOUND');
    }

    const token = jwt.sign(
      {
        userId: user.id,
        telegramUserId,
      },
      process.env.JWT_SECRET || 'default_secret',
      {
        expiresIn: '7d',
      },
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        credits: user.credits,
      },
    };
  }
}
