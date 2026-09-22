import { Router } from 'express';
import { PrismaUserRepository } from '../../repositories/PrismaUserRepository';
import { PrismaSettingsRepository } from '../../repositories/PrismaSettingsRepository';
import { UpdateUserProfileUseCase } from '../../../application/use-cases/user/UpdateUserProfileUseCase';
import { GetUserProfileUseCase } from '../../../application/use-cases/user/GetUserProfileUseCase';
import { UserController } from '../controllers/UserController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { upload } from '../../services/Multer';
import { UploadUserProfilePictureUseCase } from '../../../application/use-cases/user/UploadUserProfilePictureUseCase';
import { DeleteUserCacheUseCase } from '../../../application/use-cases/user/DeleteUserCacheUseCase';
import { DeleteAccountUseCase } from '../../../application/use-cases/user/DeleteAccountUseCase';
import { prisma } from '../../repositories/Prisma';

const userRouter = Router();
const userRepository = new PrismaUserRepository(prisma);
const settingsRepository = new PrismaSettingsRepository(prisma);
const updateUserProfileUseCase = new UpdateUserProfileUseCase(userRepository, settingsRepository);
const getUserProfileUseCase = new GetUserProfileUseCase(userRepository, settingsRepository);
const uploadUserProfilePictureUseCase = new UploadUserProfilePictureUseCase(userRepository);
const deleteUserCacheUseCase = new DeleteUserCacheUseCase(userRepository, prisma);
const deleteAccountUseCase = new DeleteAccountUseCase(userRepository);
const userController = new UserController(
  updateUserProfileUseCase,
  getUserProfileUseCase,
  uploadUserProfilePictureUseCase,
  deleteUserCacheUseCase,
  deleteAccountUseCase,
);

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: User self-service operations
 */

/**
 * @swagger
 * /users/me:
 *   patch:
 *     summary: Update current authenticated user's profile (excluding password)
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               surname:
 *                 type: string
 *               fiscalCode:
 *                 type: string
 *               companyName:
 *                 type: string
 *               vatNumber:
 *                 type: string
 *               phoneNumber:
 *                 type: string
 *               address:
 *                 type: string
 *               profilePictureUrl:
 *                 type: string
 *               qdcApiKey:
 *                 type: string
 *                 nullable: true
 *               ifarmingApiKey:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: User updated successfully
 *       400:
 *         description: No valid fields provided
 *       401:
 *         description: Unauthorized
 */
userRouter.patch(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => userController.updateMe(req, res)),
);

/**
 * @swagger
 * /users/me:
 *   get:
 *     summary: Get current authenticated user's profile
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Current user profile with API keys
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                     qdcApiKey:
 *                       type: string
 *                       nullable: true
 *                     ifarmingApiKey:
 *                       type: string
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 */
userRouter.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => userController.getMe(req, res)),
);

/**
 * @swagger
 * /users/me/profile-picture:
 *   post:
 *     summary: Upload profile picture for current authenticated user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Profile picture uploaded and user updated
 *       400:
 *         description: Missing file
 *       401:
 *         description: Unauthorized
 */
userRouter.post(
  '/me/profile-picture',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler((req, res) => userController.uploadProfilePicture(req, res)),
);

/**
 * @swagger
 * /users/me:
 *   delete:
 *     summary: Delete (soft) the current authenticated user's account
 *     description: >-
 *       Performs a soft-delete by flagging the user as deactivated.
 *       The auth cookie is cleared; existing tokens are rejected on the next
 *       request and future logins (local/Google) are rejected.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Account deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
userRouter.delete(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => userController.deleteMe(req, res)),
);

/**
 * @swagger
 * /users/me/cache:
 *   delete:
 *     summary: Delete all LLM cache entries for current authenticated user
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Cache entries deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */
userRouter.delete(
  '/me/cache',
  ensureAuthenticated,
  asyncHandler((req, res) => userController.deleteUserCache(req, res)),
);

export { userRouter };
