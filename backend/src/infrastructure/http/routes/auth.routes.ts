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

/**
 * @swagger
 * /auth/register:
 *   post:
 *     summary: Registra un nuovo utente
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - name
 *               - inviteCode
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 minLength: 6
 *               name:
 *                 type: string
 *               inviteCode:
 *                 type: string
 *                 description: Invite code required for registration
 *               surname:
 *                 type: string
 *               fiscalCode:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               profilePictureUrl:
 *                 type: string
 *     responses:
 *       201:
 *         description: Utente registrato con successo
 *       400:
 *         description: Errore nella registrazione
 *       409:
 *         description: Utente già esistente
 */
authRouter.post(
  '/register',
  authRateLimiter,
  asyncHandler((req, res) => authController.register(req, res)),
);

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Effettua il login
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login effettuato con successo
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 token:
 *                   type: string
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     name:
 *                       type: string
 *                     role:
 *                       type: string
 *                       enum: [ADMIN, GOD, BASIC, LABEL_MANAGER]
 *                     credits:
 *                       type: number
 *       400:
 *         description: Credenziali non valide
 */
authRouter.post(
  '/login',
  authRateLimiter,
  asyncHandler((req, res) => authController.login(req, res)),
);

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Richiedi il reset della password
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Se l'email esiste, un link di reset è stato inviato
 *       400:
 *         description: Email mancante
 */
authRouter.post(
  '/forgot-password',
  authRateLimiter,
  asyncHandler((req, res) => authController.forgotPassword(req, res)),
);

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reimposta la password con il token di reset
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               token:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password reimpostata con successo
 *       400:
 *         description: Token non valido o password non corrispondenti
 */
authRouter.post(
  '/reset-password',
  authRateLimiter,
  asyncHandler((req, res) => authController.resetPassword(req, res)),
);

/**
 * @swagger
 * /auth/verify:
 *   get:
 *     summary: Verifica l'email dell'utente
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Email verificata con successo
 *       400:
 *         description: Token non valido
 */
authRouter.get(
  '/verify',
  asyncHandler((req, res) => authController.verifyEmail(req, res)),
);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Ottiene i dati dell'utente corrente
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Dati dell'utente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 emailVerified:
 *                   type: boolean
 *                 role:
 *                   type: string
 *                   enum: [ADMIN, GOD, BASIC, LABEL_MANAGER]
 *                 credits:
 *                   type: number
 *       401:
 *         description: Non autorizzato
 *       404:
 *         description: Utente non trovato
 */
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

/**
 * @swagger
 * /auth/update-password:
 *   put:
 *     summary: Aggiorna la password dell'utente corrente
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *               - confirmPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *               newPassword:
 *                 type: string
 *                 minLength: 6
 *               confirmPassword:
 *                 type: string
 *                 minLength: 6
 *     responses:
 *       200:
 *         description: Password aggiornata con successo
 *       400:
 *         description: Dati mancanti o password non corrispondenti
 *       401:
 *         description: Non autorizzato o password vecchia non corretta
 */
authRouter.put(
  '/update-password',
  ensureAuthenticated,
  asyncHandler((req, res) => authController.updatePassword(req, res)),
);

/**
 * @swagger
 * /auth/logout:
 *   post:
 *     summary: Effettua il logout (cancella il cookie di sessione)
 *     description: Non richiede token valido; può essere chiamato anche con token scaduto per evitare loop 401.
 *     tags: [Auth]
 *     responses:
 *       200:
 *         description: Logout effettuato con successo (cookie auth_token cancellato)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 message:
 *                   type: string
 *                   example: Logout successful
 */
authRouter.post(
  '/logout',
  asyncHandler((req, res) => authController.logout(req, res)),
);

export { authRouter };
