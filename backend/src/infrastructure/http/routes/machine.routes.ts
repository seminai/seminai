import { Router } from 'express';
import { CompanyRole } from '@prisma/client';
import { PrismaMachineRepository } from '../../repositories/PrismaMachineRepository';
import { MachineController } from '../controllers/MachineController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureCompanyRole } from '../middlewares/ensureCompanyRole';
import { prisma } from '../../repositories/Prisma';

const router = Router();
const machineRepository = new PrismaMachineRepository(prisma);
const controller = new MachineController(machineRepository);

/**
 * @swagger
 * tags:
 *   name: Machines
 *   description: Machine CRUD operations
 */
/**
 * @swagger
 * /machines/bulk:
 *   post:
 *     summary: Create multiple Machines (bulk)
 *     tags: [Machines]
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
 *               - machines
 *             properties:
 *               machines:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - name
 *                     - identifier
 *                     - companyId
 *                   properties:
 *                     name:
 *                       type: string
 *                     identifier:
 *                       type: string
 *                     lastPositiveRevisionDate:
 *                       type: string
 *                       format: date-time
 *                     functionalControlDate:
 *                       type: string
 *                       format: date-time
 *                     calibrationDate:
 *                       type: string
 *                       format: date-time
 *                     revisionReminderDays:
 *                       type: integer
 *                       description: Number of days to remind before revision is due
 *                     calibrationReminderDays:
 *                       type: integer
 *                       description: Number of days to remind before calibration is due
 *                     functionalControlReminderDays:
 *                       type: integer
 *                       description: Number of days to remind before functional control is due
 *                     companyId:
 *                       type: string
 *     responses:
 *       201:
 *         description: Machines created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.post(
  '/bulk',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR], 'companyId'),
  asyncHandler((req, res) => controller.createMany(req, res)),
);

/**
 * @swagger
 * /machines/company/{companyId}:
 *   get:
 *     summary: List machines by company
 *     tags: [Machines]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of machines
 *       401:
 *         description: Unauthorized
 */
router.get(
  '/company/:companyId',
  ensureAuthenticated,
  ensureCompanyRole([CompanyRole.ADMIN, CompanyRole.EDITOR, CompanyRole.VIEWER], 'companyId'),
  asyncHandler((req, res) => controller.listByCompany(req, res)),
);

/**
 * @swagger
 * /machines/{id}:
 *   put:
 *     summary: Update a Machine
 *     tags: [Machines]
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
 *               name:
 *                 type: string
 *               identifier:
 *                 type: string
 *               lastPositiveRevisionDate:
 *                 type: string
 *                 format: date-time
 *               functionalControlDate:
 *                 type: string
 *                 format: date-time
 *               calibrationDate:
 *                 type: string
 *                 format: date-time
 *               revisionReminderDays:
 *                 type: integer
 *                 description: Number of days to remind before revision is due
 *               calibrationReminderDays:
 *                 type: integer
 *                 description: Number of days to remind before calibration is due
 *               functionalControlReminderDays:
 *                 type: integer
 *                 description: Number of days to remind before functional control is due
 *               companyId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Machine updated
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Not found
 */
router.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.update(req, res)),
);

/**
 * @swagger
 * /machines/bulk:
 *   delete:
 *     summary: Delete multiple Machines (bulk)
 *     tags: [Machines]
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
 *               - ids
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       204:
 *         description: Machines deleted
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 */
router.delete(
  '/bulk',
  ensureAuthenticated,
  asyncHandler((req, res) => controller.deleteMany(req, res)),
);

export { router as machineRouter };
