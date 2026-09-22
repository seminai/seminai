export {};

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
