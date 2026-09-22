import { Router } from 'express';
import { JobVerificationAgentController } from '../controllers/JobVerificationAgentController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';
import { optimizeJobPayload } from '../middlewares/optimizeJobPayload';

const jobVerificationAgentRouter = Router();
const controller = new JobVerificationAgentController();

/**
 * @swagger
 * tags:
 *   name: Job Verification Agent
 *   description: Chat agent for verifying and validating agricultural jobs
 */

/**
 * @swagger
 * /job-verification-agent/stream:
 *   post:
 *     summary: Stream chat response from job verification agent
 *     tags: [Job Verification Agent]
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
 *               - jobs
 *               - message
 *             properties:
 *               threadId:
 *                 type: string
 *                 description: Unique identifier for the conversation thread
 *               jobs:
 *                 type: array
 *                 description: Array of jobs to verify (JobWithAssignmentDTO)
 *                 items:
 *                   type: object
 *               message:
 *                 type: string
 *                 description: User message
 *               metadata:
 *                 type: object
 *                 description: Optional metadata (images, links, pdfs)
 *                 properties:
 *                   images:
 *                     type: array
 *                     items:
 *                       type: string
 *                   links:
 *                     type: array
 *                     items:
 *                       type: string
 *                   pdfs:
 *                     type: array
 *                     items:
 *                       type: string
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo]
 *                 description: "OpenAI model to use (default: gpt-4o)"
 *               temperature:
 *                 type: number
 *                 description: "Temperature for model (default: 0)"
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
jobVerificationAgentRouter.post(
  '/stream',
  ensureAuthenticated,
  optimizeJobPayload,
  asyncHandler(controller.stream.bind(controller)),
);

/**
 * @swagger
 * /job-verification-agent/message:
 *   post:
 *     summary: Send a message to the job verification agent (non-streaming)
 *     tags: [Job Verification Agent]
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
 *               - jobs
 *               - message
 *             properties:
 *               threadId:
 *                 type: string
 *               jobs:
 *                 type: array
 *                 items:
 *                   type: object
 *               message:
 *                 type: string
 *               metadata:
 *                 type: object
 *               modelName:
 *                 type: string
 *                 enum: [gpt-4o, gpt-4o-mini, gpt-4-turbo, gpt-4, gpt-3.5-turbo]
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: Agent response
 */
jobVerificationAgentRouter.post(
  '/message',
  ensureAuthenticated,
  optimizeJobPayload,
  asyncHandler(controller.message.bind(controller)),
);

/**
 * @swagger
 * /job-verification-agent/approve:
 *   post:
 *     summary: Approve pending tool execution or job modification
 *     tags: [Job Verification Agent]
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
 *               modification:
 *                 type: object
 *                 description: Job modification to apply (if approving a modification)
 *                 properties:
 *                   jobId:
 *                     type: string
 *                   field:
 *                     type: string
 *                   newValue:
 *                     oneOf:
 *                       - type: string
 *                       - type: number
 *                       - type: boolean
 *                       - type: object
 *               modelName:
 *                 type: string
 *               temperature:
 *                 type: number
 *     responses:
 *       200:
 *         description: Action approved and executed
 */
jobVerificationAgentRouter.post(
  '/approve',
  ensureAuthenticated,
  asyncHandler(controller.approve.bind(controller)),
);

/**
 * @swagger
 * /job-verification-agent/reject:
 *   post:
 *     summary: Reject pending tool execution or modification
 *     tags: [Job Verification Agent]
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
 *               - reason
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
jobVerificationAgentRouter.post(
  '/reject',
  ensureAuthenticated,
  asyncHandler(controller.reject.bind(controller)),
);

/**
 * @swagger
 * /job-verification-agent/state/{threadId}:
 *   get:
 *     summary: Get conversation state for a thread
 *     tags: [Job Verification Agent]
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
jobVerificationAgentRouter.get(
  '/state/:threadId',
  ensureAuthenticated,
  asyncHandler(controller.getState.bind(controller)),
);

export { jobVerificationAgentRouter };
