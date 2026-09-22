import { Router } from 'express';
import { SettingsController } from '../controllers/SettingsController';
import { PrismaSettingsRepository } from '../../repositories/PrismaSettingsRepository';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const settingsRouter = Router();
const settingsRepository = new PrismaSettingsRepository(prisma);
const settingsController = new SettingsController(settingsRepository);

/**
 * @swagger
 * tags:
 *   name: Settings
 *   description: User settings management
 */

/**
 * @swagger
 * /settings:
 *   post:
 *     summary: Create settings for the authenticated user
 *     tags: [Settings]
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
 *               - language
 *             properties:
 *               language:
 *                 type: string
 *               qdcApiKey:
 *                 type: string
 *                 nullable: true
 *               ifarmingApiKey:
 *                 type: string
 *                 nullable: true
 *               tablesViewMode:
 *                 type: string
 *                 enum: [grid, excel]
 *                 default: grid
 *                 description: Preferred rendering mode for app data tables
 *     responses:
 *       201:
 *         description: Settings created
 *       400:
 *         description: Missing or invalid data
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Settings already exist for user
 */
settingsRouter.post(
  '/',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.create(req, res)),
);

/**
 * @swagger
 * /settings/me:
 *   get:
 *     summary: Get settings of the authenticated user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Settings fetched
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Settings not found
 */
settingsRouter.get(
  '/me',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getMine(req, res)),
);

// ============================================
// WHATSAPP INTEGRATION ROUTES
// ============================================

/**
 * @swagger
 * /settings/whatsapp/setup:
 *   post:
 *     summary: Setup WhatsApp integration
 *     description: Creates a new WhatsApp instance via Evolution API and returns QR code for connection
 *     tags: [Settings, WhatsApp]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               instanceName:
 *                 type: string
 *                 description: Optional custom instance name
 *     responses:
 *       201:
 *         description: WhatsApp instance created
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
 *                     instanceName:
 *                       type: string
 *                     instanceId:
 *                       type: string
 *                     apiKey:
 *                       type: string
 *                     qrCode:
 *                       type: string
 *                       nullable: true
 *                     qrCodeBase64:
 *                       type: string
 *                       nullable: true
 *       400:
 *         description: Bad request or Evolution API error
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: WhatsApp already connected
 */
settingsRouter.post(
  '/whatsapp/setup',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.setupWhatsApp(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/qr-code:
 *   get:
 *     summary: Get WhatsApp QR code for connection
 *     description: Returns a fresh QR code to scan with WhatsApp mobile app
 *     tags: [Settings, WhatsApp]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: QR code retrieved
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
 *                     qrCode:
 *                       type: string
 *                     qrCodeBase64:
 *                       type: string
 *                     pairingCode:
 *                       type: string
 *                       nullable: true
 *       400:
 *         description: WhatsApp not configured or already connected
 *       401:
 *         description: Unauthorized
 */
settingsRouter.get(
  '/whatsapp/qr-code',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getWhatsAppQrCode(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/status:
 *   get:
 *     summary: Get WhatsApp connection status
 *     description: Returns the current connection status of WhatsApp
 *     tags: [Settings, WhatsApp]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Status retrieved
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
 *                     configured:
 *                       type: boolean
 *                     connected:
 *                       type: boolean
 *                     status:
 *                       type: string
 *                       enum: [disconnected, connecting, connected, qr_code_ready]
 *                     instanceName:
 *                       type: string
 *                       nullable: true
 *                     phoneNumber:
 *                       type: string
 *                       nullable: true
 *                     lastSync:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *       401:
 *         description: Unauthorized
 */
settingsRouter.get(
  '/whatsapp/status',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getWhatsAppStatus(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/disconnect:
 *   post:
 *     summary: Disconnect WhatsApp
 *     description: Disconnects WhatsApp session. Optionally deletes the instance completely.
 *     tags: [Settings, WhatsApp]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               deleteInstance:
 *                 type: boolean
 *                 description: If true, completely removes the WhatsApp instance
 *     responses:
 *       200:
 *         description: WhatsApp disconnected
 *       400:
 *         description: WhatsApp not configured
 *       401:
 *         description: Unauthorized
 */
settingsRouter.post(
  '/whatsapp/disconnect',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.disconnectWhatsApp(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/send-message:
 *   post:
 *     summary: Send a WhatsApp message
 *     description: Sends a text message to a specified phone number
 *     tags: [Settings, WhatsApp]
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
 *               - phoneNumber
 *               - message
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Phone number in international format (e.g., +393331234567)
 *               message:
 *                 type: string
 *                 description: Message text to send
 *     responses:
 *       200:
 *         description: Message sent successfully
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
 *                     success:
 *                       type: boolean
 *                     messageId:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *       400:
 *         description: WhatsApp not connected or invalid request
 *       401:
 *         description: Unauthorized
 */
settingsRouter.post(
  '/whatsapp/send-message',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.sendWhatsAppMessage(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/allowlist:
 *   get:
 *     summary: Get WhatsApp phone number allowlist
 *     description: Returns the list of phone numbers allowed to interact with the WhatsApp bot. An empty list means all numbers are allowed.
 *     tags: [Settings, WhatsApp]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Allowlist retrieved
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
 *                     allowedNumbers:
 *                       type: array
 *                       items:
 *                         type: string
 *                     count:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Settings not found
 */
settingsRouter.get(
  '/whatsapp/allowlist',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getWhatsAppAllowlist(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/allowlist:
 *   post:
 *     summary: Add a phone number to the WhatsApp allowlist
 *     description: Adds a phone number that is permitted to interact with the WhatsApp bot. Number is normalized (stripped of +, spaces, dashes).
 *     tags: [Settings, WhatsApp]
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
 *               - phoneNumber
 *             properties:
 *               phoneNumber:
 *                 type: string
 *                 description: Phone number in international format (e.g., 393331234567 or +393331234567)
 *     responses:
 *       201:
 *         description: Number added to allowlist
 *       400:
 *         description: Invalid phone number
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Settings not found
 *       409:
 *         description: Number already in allowlist
 */
settingsRouter.post(
  '/whatsapp/allowlist',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.addWhatsAppAllowedNumber(req, res)),
);

/**
 * @swagger
 * /settings/whatsapp/allowlist/{phoneNumber}:
 *   delete:
 *     summary: Remove a phone number from the WhatsApp allowlist
 *     description: Removes a phone number from the allowlist. If the list becomes empty, all numbers will be allowed again.
 *     tags: [Settings, WhatsApp]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: phoneNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: The phone number to remove (e.g., 393331234567)
 *     responses:
 *       200:
 *         description: Number removed from allowlist
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Settings not found or number not in allowlist
 */
settingsRouter.delete(
  '/whatsapp/allowlist/:phoneNumber',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.removeWhatsAppAllowedNumber(req, res)),
);

// ============================================
// END WHATSAPP ROUTES
// ============================================

/**
 * @swagger
 * /settings/{id}:
 *   get:
 *     summary: Get settings by id (owner only)
 *     tags: [Settings]
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
 *         description: Settings fetched
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
settingsRouter.get(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getById(req, res)),
);

/**
 * @swagger
 * /settings/{id}:
 *   put:
 *     summary: Update settings (owner only)
 *     tags: [Settings]
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
 *               language:
 *                 type: string
 *               qdcApiKey:
 *                 type: string
 *                 nullable: true
 *               ifarmingApiKey:
 *                 type: string
 *                 nullable: true
 *               tablesViewMode:
 *                 type: string
 *                 enum: [grid, excel]
 *                 description: Preferred rendering mode for app data tables
 *     responses:
 *       200:
 *         description: Settings updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
settingsRouter.put(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.update(req, res)),
);

/**
 * @swagger
 * /settings/{id}:
 *   delete:
 *     summary: Delete settings (owner only)
 *     tags: [Settings]
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
 *         description: Settings deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
settingsRouter.delete(
  '/:id',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.delete(req, res)),
);

/**
 * @swagger
 * /settings/email-inbound:
 *   get:
 *     summary: Get the email inbound integration status
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Email inbound integration status
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
 *                     enabled:
 *                       type: boolean
 *                       description: Whether inbound emails from this user are processed
 *                     inboxAddress:
 *                       type: string
 *                       description: The address users should send emails to
 *       401:
 *         description: Unauthorized
 */
settingsRouter.get(
  '/email-inbound',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getEmailInboundStatus(req, res)),
);

/**
 * @swagger
 * /settings/email-inbound:
 *   patch:
 *     summary: Toggle the email inbound integration for the authenticated user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated email inbound integration status
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
settingsRouter.patch(
  '/email-inbound',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.updateEmailInbound(req, res)),
);

/**
 * @swagger
 * /settings/open-meteo:
 *   get:
 *     summary: Get the Open-Meteo weather integration status
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Open-Meteo integration status
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
 *                     enabled:
 *                       type: boolean
 *                       description: Whether weather tools are available to the agent
 *       401:
 *         description: Unauthorized
 */
settingsRouter.get(
  '/open-meteo',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getOpenMeteoStatus(req, res)),
);

/**
 * @swagger
 * /settings/open-meteo:
 *   patch:
 *     summary: Toggle the Open-Meteo weather integration for the authenticated user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated Open-Meteo integration status
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
settingsRouter.patch(
  '/open-meteo',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.updateOpenMeteo(req, res)),
);

/**
 * @swagger
 * /settings/qdc-sync:
 *   get:
 *     summary: Get the QDC nightly sync opt-in for the authenticated user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: QDC sync opt-in status
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
 *                     enabled:
 *                       type: boolean
 *                       description: Whether the nightly QDC mirror sync is enabled for this user
 *       401:
 *         description: Unauthorized
 */
settingsRouter.get(
  '/qdc-sync',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.getQdcSyncStatus(req, res)),
);

/**
 * @swagger
 * /settings/qdc-sync:
 *   patch:
 *     summary: Toggle the QDC nightly sync opt-in for the authenticated user
 *     tags: [Settings]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [enabled]
 *             properties:
 *               enabled:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Updated QDC sync opt-in status
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
 *                     enabled:
 *                       type: boolean
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
settingsRouter.patch(
  '/qdc-sync',
  ensureAuthenticated,
  asyncHandler((req, res) => settingsController.updateQdcSync(req, res)),
);

export { settingsRouter };
