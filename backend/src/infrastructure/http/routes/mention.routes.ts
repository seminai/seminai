import { Router } from 'express';
import { MentionController } from '../controllers/MentionController';
import { asyncHandler } from '../middlewares/asyncHandler';
import { ensureAuthenticated } from '../middlewares/ensureAuthenticated';

const mentionRouter = Router();
const controller = new MentionController();

/**
 * @swagger
 * tags:
 *   name: Mentions
 *   description: Unified search for @mention autocomplete in chat
 */

/**
 * @swagger
 * /mentions/search:
 *   get:
 *     summary: Search mentionable entities for chat autocomplete
 *     tags: [Mentions]
 *     security:
 *       - bearerAuth: []
 *       - cookieAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema:
 *           type: string
 *         description: Search query (partial name match)
 *       - in: query
 *         name: types
 *         schema:
 *           type: string
 *         description: >
 *           Comma-separated entity types to search.
 *           Valid values: company, product, field, production_unit, stock, file.
 *           Defaults to all types if omitted.
 *     responses:
 *       200:
 *         description: List of matching entities
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: success
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       type:
 *                         type: string
 *                         enum: [company, product, field, production_unit, stock, file]
 *                       label:
 *                         type: string
 *                       subtitle:
 *                         type: string
 *       400:
 *         description: Missing or invalid query parameter
 *       401:
 *         description: Unauthorized
 */
mentionRouter.get('/search', ensureAuthenticated, asyncHandler(controller.search.bind(controller)));

export { mentionRouter };
