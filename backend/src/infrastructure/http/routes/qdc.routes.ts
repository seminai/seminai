import { Router } from 'express';
import { QdcController } from '../controllers/QdcController';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { createQdcFacadeRouter } from './qdc-facade.routes';

const qdcRouter = Router();
const qdcController = new QdcController();
qdcRouter.use(createQdcFacadeRouter());

/**
 * @swagger
 * tags:
 *   name: Qdc
 *   description: QDC mirror sync plus live Image Line v2 facade (licenza, operazioni, magazzino, stampe)
 */

/**
 * @swagger
 * /qdc/sync:
 *   post:
 *     summary: Start a manual QDC mirror sync
 *     description: Enqueues a background run that copies the QDC official logbook data (aziende, unità, operazioni, giacenze, scadenze) into the Seminai mirror tables.
 *     tags: [Qdc]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       202:
 *         description: Sync run enqueued
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
 *                     syncRunId:
 *                       type: string
 *       400:
 *         description: QDC integration not configured (missing client id)
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: A sync run is already in progress
 */
qdcRouter.post(
  '/sync',
  ensureAuthenticated,
  asyncHandler((req, res) => qdcController.startSync(req, res)),
);

/**
 * @swagger
 * /qdc/sync/status:
 *   get:
 *     summary: Get the last QDC sync run and mirror counters
 *     tags: [Qdc]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Last sync run (null when never run) and mirrored aziende count
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
 *                     run:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         id:
 *                           type: string
 *                         trigger:
 *                           type: string
 *                           description: cron | manual
 *                         status:
 *                           type: string
 *                           description: running | success | partial | error
 *                         startedAt:
 *                           type: string
 *                         finishedAt:
 *                           type: string
 *                           nullable: true
 *                         counters:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             aziendeTotal:
 *                               type: number
 *                             aziendeFailed:
 *                               type: number
 *                             unitaUpserted:
 *                               type: number
 *                             operazioniUpserted:
 *                               type: number
 *                             operazioniDeleted:
 *                               type: number
 *                             giacenzeRows:
 *                               type: number
 *                             scadenzeRows:
 *                               type: number
 *                             skippedNoId:
 *                               type: number
 *                         error:
 *                           type: string
 *                           nullable: true
 *                     aziendaCount:
 *                       type: number
 *       401:
 *         description: Unauthorized
 */
qdcRouter.get(
  '/sync/status',
  ensureAuthenticated,
  asyncHandler((req, res) => qdcController.getSyncStatus(req, res)),
);

export { qdcRouter };
