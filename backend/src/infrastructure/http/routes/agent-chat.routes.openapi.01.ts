export {};

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
