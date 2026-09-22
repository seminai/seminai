import { Router } from 'express';
import { PrismaPatentinoRepository } from '../../repositories/PrismaPatentinoRepository';
import { PatentinoController } from '../controllers/PatentinoController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';
import { createResourceAccessGuard } from '../access/create-resource-access-guard';

const router = Router();
const patentinoRepository = new PrismaPatentinoRepository(prisma);

const controller = new PatentinoController(patentinoRepository, createResourceAccessGuard(prisma));

/**
 * @swagger
 * tags:
 *   name: Patentino
 *   description: Patentino CRUD operations
 */

/**
 * @swagger
 * /patentini:
 *   post:
 *     summary: Create a new Patentino
 *     tags: [Patentino]
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
 *               - type
 *               - code
 *               - expiresAt
 *               - releaseAt
 *               - userId
 *             properties:
 *               type:
 *                 type: string
 *               code:
 *                 type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               releaseAt:
 *                 type: string
 *                 format: date-time
 *               isActive:
 *                 type: boolean
 *               userId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Patentino created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Duplicate code
 */
router.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.create(req, res)),
);

/**
 * @swagger
 * /patentini/{id}:
 *   get:
 *     summary: Get Patentino by ID
 *     tags: [Patentino]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Patentino found
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.findById(req, res)),
);

/**
 * @swagger
 * /patentini/user/{userId}:
 *   get:
 *     summary: List patentini by user
 *     tags: [Patentino]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of patentini
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/user/:userId',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.listByUser(req, res)),
);

/**
 * @swagger
 * /patentini/{id}:
 *   put:
 *     summary: Update a Patentino
 *     tags: [Patentino]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type:
 *                 type: string
 *               code:
 *                 type: string
 *               expiresAt:
 *                 type: string
 *                 format: date-time
 *               releaseAt:
 *                 type: string
 *                 format: date-time
 *               isActive:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Patentino updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 *       409:
 *         description: Duplicate code
 */
router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

/**
 * @swagger
 * /patentini/{id}:
 *   delete:
 *     summary: Delete a Patentino
 *     tags: [Patentino]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.delete(req, res)),
);

export { router as patentinoRouter };
