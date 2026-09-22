import { Router, Request, Response } from 'express';
import { AgentChatController } from '../controllers/AgentChatController';
import { AgentExtractionReviewController } from '../controllers/AgentExtractionReviewController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { upload } from '../../services/Multer';
import { OuterLoopService } from '../../services/agents/dosage_agent_react/outer-loop/outer-loop.service';
import { AppError } from '../../../domain/errors/AppError';

const agentChatRouter = Router();
const controller = new AgentChatController();
const extractionReviewController = new AgentExtractionReviewController();

/**
 * @swagger
 * tags:
 *   name: Agent Chat
 *   description: Generic agent chat interface (currently connected to ChatDosageAgent)
 */

/**
 * @swagger
 * /agent-chat/stream:
 *   post:
 *     summary: Stream chat response from agent
 *     tags: [Agent Chat]
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
 *                 description: User message
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo]
 *                 description: "OpenAI model to use (default: gpt-4o)"
 *               temperature:
 *                 type: number
 *                 description: "Temperature for model (default: 0)"
 *               jobId:
 *                 type: string
 *                 description: Optional Job ID to provide context to the agent
 *               workspaceId:
 *                 type: string
 *                 description: Active workspace ID; routes the chat to the agent matching the workspace kind
 *               mentions:
 *                 type: array
 *                 description: Structured @mentions from the chat UI
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [company, product, field, production_unit, stock, file]
 *                     id:
 *                       type: string
 *                     label:
 *                       type: string
 *         multipart/form-data:
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
 *                 description: User message
 *               files:
 *                 type: array
 *                 description: Attachments persisted on the user message metadata
 *                 items:
 *                   type: string
 *                   format: binary
 *               mentions:
 *                 type: string
 *                 description: JSON string with structured @mentions from the chat UI
 *               clientContext:
 *                 type: string
 *                 description: JSON string with optional client context
 *               workspaceId:
 *                 type: string
 *                 description: Active workspace ID; routes the chat to the agent matching the workspace kind
 *     responses:
 *       200:
 *         description: SSE stream of events
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 */
agentChatRouter.post(
  '/stream',
  ensureAuthenticated,
  upload.array('files', 10),
  asyncHandler(controller.stream.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/message:
 *   post:
 *     summary: Send a message to the agent (non-streaming)
 *     tags: [Agent Chat]
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
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo]
 *               temperature:
 *                 type: number
 *               jobId:
 *                 type: string
 *                 description: Optional Job ID to provide context to the agent
 *               workspaceId:
 *                 type: string
 *                 description: Active workspace ID; routes the chat to the agent matching the workspace kind
 *               mentions:
 *                 type: array
 *                 description: Structured @mentions from the chat UI
 *                 items:
 *                   type: object
 *                   properties:
 *                     type:
 *                       type: string
 *                       enum: [company, product, field, production_unit, stock, file]
 *                     id:
 *                       type: string
 *                     label:
 *                       type: string
 *     responses:
 *       200:
 *         description: Agent response
 */
agentChatRouter.post(
  '/message',
  ensureAuthenticated,
  asyncHandler(controller.message.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/approve:
 *   post:
 *     summary: Approve pending tool execution
 *     tags: [Agent Chat]
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
agentChatRouter.post(
  '/approve',
  ensureAuthenticated,
  asyncHandler(controller.approve.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/reject:
 *   post:
 *     summary: Reject pending tool execution
 *     tags: [Agent Chat]
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
 *               reason:
 *                 type: string
 *               modelName:
 *                 type: string
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: Action rejected
 */
agentChatRouter.post(
  '/reject',
  ensureAuthenticated,
  asyncHandler(controller.reject.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/cancel:
 *   post:
 *     summary: Cancel an in-flight agent stream for a thread
 *     tags: [Agent Chat]
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
 *     responses:
 *       200:
 *         description: Cancellation request processed
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
 *                     aborted:
 *                       type: boolean
 */
agentChatRouter.post(
  '/cancel',
  ensureAuthenticated,
  asyncHandler(controller.cancel.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/threads/{threadId}/stream-state:
 *   get:
 *     summary: Get resumption state of a thread stream (catch-up)
 *     tags: [Agent Chat]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: threadId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stream state
 */
agentChatRouter.get(
  '/threads/:threadId/stream-state',
  ensureAuthenticated,
  asyncHandler(controller.getStreamState.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/threads/{threadId}/stream-events:
 *   get:
 *     summary: List persisted stream events with seq greater than since
 *     tags: [Agent Chat]
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
 *         name: since
 *         schema:
 *           type: integer
 *           default: 0
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 200
 *     responses:
 *       200:
 *         description: Persisted events
 */
agentChatRouter.get(
  '/threads/:threadId/stream-events',
  ensureAuthenticated,
  asyncHandler(controller.getStreamEvents.bind(controller)),
);

/**
 * @swagger
 * /agent-chat/state/{threadId}:
 *   get:
 *     summary: Get conversation state for a thread
 *     tags: [Agent Chat]
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
agentChatRouter.get(
  '/state/:threadId',
  ensureAuthenticated,
  asyncHandler(controller.getState.bind(controller)),
);

// ── Extraction Review (Fase 3 + 4) ──

agentChatRouter.get(
  '/pending-extraction/:reviewId',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.getById.bind(extractionReviewController)),
);

agentChatRouter.patch(
  '/pending-extraction/:reviewId',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.save.bind(extractionReviewController)),
);

agentChatRouter.post(
  '/pending-extraction/:reviewId/commit',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.commit.bind(extractionReviewController)),
);

agentChatRouter.post(
  '/pending-extraction/:reviewId/cancel',
  ensureAuthenticated,
  asyncHandler(extractionReviewController.cancel.bind(extractionReviewController)),
);

// ── Outer Loop Triggers ──

const outerLoopService = new OuterLoopService();

agentChatRouter.post(
  '/outer-loop/schedule',
  ensureAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    const { type, title, payload, scheduledAt, threadId } = req.body;
    const trigger = await outerLoopService.scheduleAlert({
      userId,
      type,
      title,
      payload: payload ?? {},
      scheduledAt: new Date(scheduledAt),
      threadId,
    });
    return res.status(201).json(trigger);
  }),
);

agentChatRouter.get(
  '/outer-loop/triggers',
  ensureAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    const status = req.query.status as string | undefined;
    const triggers = await outerLoopService.listAllTriggers(userId, { status });
    return res.json(triggers);
  }),
);

agentChatRouter.delete(
  '/outer-loop/triggers/:id',
  ensureAuthenticated,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user?.id;
    if (!userId) throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    await outerLoopService.cancelAlert(req.params.id, userId);
    return res.status(204).send();
  }),
);

export { agentChatRouter };
