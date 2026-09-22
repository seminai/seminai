export {};

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
