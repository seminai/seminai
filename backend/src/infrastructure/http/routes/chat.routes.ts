import { Router } from 'express';
import { ChatController } from '../controllers/ChatController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const chatRouter = Router();
const controller = new ChatController();

/**
 * @swagger
 * tags:
 *   name: Chats
 *   description: Chat history management
 */

/**
 * @swagger
 * /chats:
 *   get:
 *     summary: Get all chats for the authenticated user
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *           enum: [DOSAGE_AGENT, JOB_VERIFICATION_AGENT]
 *         description: Filter chats by category
 *     responses:
 *       200:
 *         description: List of chats
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       threadId:
 *                         type: string
 *                       category:
 *                         type: string
 *                       modelName:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                       lastMessage:
 *                         type: object
 *                         nullable: true
 *       401:
 *         description: Unauthorized
 */
chatRouter.get('/', ensureAuthenticated, asyncHandler(controller.list.bind(controller)));

/**
 * @swagger
 * /chats/{id}:
 *   get:
 *     summary: Get a single chat with all messages
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *     responses:
 *       200:
 *         description: Chat with messages
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - user does not own this chat
 *       404:
 *         description: Chat not found
 */
chatRouter.get('/:id', ensureAuthenticated, asyncHandler(controller.getById.bind(controller)));

/**
 * @swagger
 * /chats/{id}:
 *   delete:
 *     summary: Delete a chat and all its messages
 *     tags: [Chats]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Chat ID
 *     responses:
 *       200:
 *         description: Chat deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - user does not own this chat
 *       404:
 *         description: Chat not found
 */
chatRouter.delete('/:id', ensureAuthenticated, asyncHandler(controller.delete.bind(controller)));

export { chatRouter };
