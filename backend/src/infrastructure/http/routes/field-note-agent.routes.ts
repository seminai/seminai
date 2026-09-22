import { Router } from 'express';
import { FieldNoteAgentController } from '../controllers/FieldNoteAgentController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { upload } from '../../services/Multer';

const fieldNoteAgentRouter = Router();
const controller = new FieldNoteAgentController();

/**
 * @swagger
 * tags:
 *   name: Field Note Agent
 *   description: AI agent for field note classification and management
 */

/**
 * @swagger
 * /field-note-agent/stream:
 *   post:
 *     summary: Stream chat response from field note agent
 *     tags: [Field Note Agent]
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
 *               - threadId
 *               - message
 *             properties:
 *               threadId:
 *                 type: string
 *                 description: Unique identifier for the conversation thread
 *               message:
 *                 type: string
 *                 description: Field note message (e.g., "ho dato 10 kg di rame nel campo vite")
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo]
 *                 description: "OpenAI model to use (default: gpt-4o)"
 *               temperature:
 *                 type: number
 *                 description: "Temperature for model (default: 0.1)"
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - threadId
 *             properties:
 *               threadId:
 *                 type: string
 *                 description: Unique identifier for the conversation thread
 *               message:
 *                 type: string
 *                 description: Field note message (optional when file is provided)
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 description: Optional file type metadata
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo]
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: SSE stream of events (token, tool_call, complete, requires_approval)
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
fieldNoteAgentRouter.post(
  '/stream',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler(controller.stream.bind(controller)),
);

/**
 * @swagger
 * /field-note-agent/message:
 *   post:
 *     summary: Send a message to the field note agent (non-streaming)
 *     tags: [Field Note Agent]
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
 *               - threadId
 *               - message
 *             properties:
 *               threadId:
 *                 type: string
 *               message:
 *                 type: string
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo]
 *               temperature:
 *                 type: number
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - threadId
 *             properties:
 *               threadId:
 *                 type: string
 *               message:
 *                 type: string
 *                 description: Field note message (optional when file is provided)
 *               file:
 *                 type: string
 *                 format: binary
 *               type:
 *                 type: string
 *                 description: Optional file type metadata
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo]
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: Agent response
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
 *                     status:
 *                       type: string
 *                       enum: [COMPLETED, REQUIRES_APPROVAL, ERROR]
 *                     message:
 *                       type: string
 *                     pendingToolCalls:
 *                       type: array
 */
fieldNoteAgentRouter.post(
  '/message',
  ensureAuthenticated,
  upload.single('file'),
  asyncHandler(controller.message.bind(controller)),
);

/**
 * @swagger
 * /field-note-agent/approve:
 *   post:
 *     summary: Approve pending tool execution
 *     tags: [Field Note Agent]
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
 *               - threadId
 *             properties:
 *               threadId:
 *                 type: string
 *               modelName:
 *                 type: string
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: Action approved and executed
 */
fieldNoteAgentRouter.post(
  '/approve',
  ensureAuthenticated,
  asyncHandler(controller.approve.bind(controller)),
);

/**
 * @swagger
 * /field-note-agent/reject:
 *   post:
 *     summary: Reject pending tool execution and provide feedback
 *     tags: [Field Note Agent]
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
 *               - threadId
 *               - feedback
 *             properties:
 *               threadId:
 *                 type: string
 *               feedback:
 *                 type: string
 *                 description: User feedback or correction (e.g., "No, il campo era vigneto nord")
 *               modelName:
 *                 type: string
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: Action rejected, agent revised with feedback
 */
fieldNoteAgentRouter.post(
  '/reject',
  ensureAuthenticated,
  asyncHandler(controller.reject.bind(controller)),
);

/**
 * @swagger
 * /field-note-agent/state/{threadId}:
 *   get:
 *     summary: Get conversation state for a thread
 *     tags: [Field Note Agent]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: modelName
 *         schema:
 *           type: string
 *       - in: query
 *         name: temperature
 *         schema:
 *           type: number
 *     responses:
 *       200:
 *         description: Conversation state
 */
fieldNoteAgentRouter.get(
  '/state/:threadId',
  ensureAuthenticated,
  asyncHandler(controller.getState.bind(controller)),
);

export { fieldNoteAgentRouter };
