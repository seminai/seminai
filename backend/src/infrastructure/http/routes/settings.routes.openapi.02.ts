export {};

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
