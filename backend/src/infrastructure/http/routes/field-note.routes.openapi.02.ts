export {};

/**
 * @swagger
 * /field-notes/attachments:
 *   post:
 *     summary: Add an attachment to a field note
 *     tags: [Field Notes]
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
 *               - fieldNoteId
 *               - fileUrl
 *               - fileName
 *               - fileType
 *               - fileSize
 *             properties:
 *               fieldNoteId:
 *                 type: string
 *               fileUrl:
 *                 type: string
 *               fileName:
 *                 type: string
 *               fileType:
 *                 type: string
 *               fileSize:
 *                 type: number
 *               thumbnailUrl:
 *                 type: string
 *               metadata:
 *                 type: object
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - fieldNoteId
 *               - file
 *             properties:
 *               fieldNoteId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *               fileName:
 *                 type: string
 *               fileType:
 *                 type: string
 *               fileSize:
 *                 type: number
 *               thumbnailUrl:
 *                 type: string
 *               metadata:
 *                 type: object
 *     responses:
 *       201:
 *         description: Attachment added successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
