export {};

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
