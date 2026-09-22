import { Router, Request, Response } from 'express';
import { AuthController } from '../controllers/AuthController';
import { RegisterUseCase } from '../../../application/use-cases/auth/RegisterUseCase';
import { LoginUseCase } from '../../../application/use-cases/auth/LoginUseCase';
import { VerifyEmailUseCase } from '../../../application/use-cases/auth/VerifyEmailUseCase';
import { UpdatePasswordUseCase } from '../../../application/use-cases/auth/UpdatePasswordUseCase';
import { LogoutUseCase } from '../../../application/use-cases/auth/LogoutUseCase';
import { ForgotPasswordUseCase } from '../../../application/use-cases/auth/ForgotPasswordUseCase';
import { ResetPasswordUseCase } from '../../../application/use-cases/auth/ResetPasswordUseCase';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { authRateLimiter } from '../middlewares/rateLimiter';
import { prisma } from '../../repositories/Prisma';

const authRouter = Router();
const userRepository = new PrismaUserRepository(prisma);

const registerUseCase = new RegisterUseCase(userRepository);
const loginUseCase = new LoginUseCase(userRepository);
const verifyEmailUseCase = new VerifyEmailUseCase(userRepository);
const updatePasswordUseCase = new UpdatePasswordUseCase(userRepository);
const logoutUseCase = new LogoutUseCase();
const forgotPasswordUseCase = new ForgotPasswordUseCase(userRepository);
const resetPasswordUseCase = new ResetPasswordUseCase(userRepository);

const authController = new AuthController(
  registerUseCase,
  loginUseCase,
  verifyEmailUseCase,
  updatePasswordUseCase,
  logoutUseCase,
  forgotPasswordUseCase,
  resetPasswordUseCase,
);

authRouter.post(
  '/register',
  authRateLimiter,
  asyncHandler((req, res) => authController.register(req, res)),
);

authRouter.post(
  '/login',
  authRateLimiter,
  asyncHandler((req, res) => authController.login(req, res)),
);

authRouter.post(
  '/forgot-password',
  authRateLimiter,
  asyncHandler((req, res) => authController.forgotPassword(req, res)),
);

authRouter.post(
  '/reset-password',
  authRateLimiter,
  asyncHandler((req, res) => authController.resetPassword(req, res)),
);

authRouter.get(
  '/verify',
  asyncHandler((req, res) => authController.verifyEmail(req, res)),
);

authRouter.get('/me', ensureAuthenticated, async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'User not authenticated' });
    }

    const user = await userRepository.findById(req.user.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    return res.json({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      profilePictureUrl: user.profilePictureUrl,
      role: user.role,
      credits: user.credits,
    });
  } catch (error) {
    return res.status(500).json({
      message: error instanceof Error ? error.message : 'Internal server error',
    });
  }
});

authRouter.put(
  '/update-password',
  ensureAuthenticated,
  asyncHandler((req, res) => authController.updatePassword(req, res)),
);

authRouter.post(
  '/logout',
  asyncHandler((req, res) => authController.logout(req, res)),
);

export { authRouter };
