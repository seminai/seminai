import { Router } from 'express';
import { WhatsAppWebhookController } from '../controllers/WhatsAppWebhookController';
import { PrismaSettingsRepository } from '../../repositories/PrismaSettingsRepository';
import { EvolutionApiService } from '../../services/whatsapp/EvolutionApiService';
import { asyncHandler } from '../middlewares/asyncHandler';
import { prisma } from '../../repositories/Prisma';

const whatsappWebhookRouter = Router();

// Initialize dependencies only if Evolution API is configured
const evolutionApiUrl = process.env.EVOLUTION_API_URL;
const evolutionApiKey = process.env.EVOLUTION_API_KEY;

let whatsappWebhookController: WhatsAppWebhookController | null = null;

if (evolutionApiUrl && evolutionApiKey) {
  const evolutionApi = new EvolutionApiService({
    baseUrl: evolutionApiUrl,
    globalApiKey: evolutionApiKey,
  });

  const settingsRepository = new PrismaSettingsRepository(prisma);

  whatsappWebhookController = new WhatsAppWebhookController(
    prisma,
    evolutionApi,
    settingsRepository,
  );
}

/**
 * @swagger
 * tags:
 *   name: WhatsApp Webhook
 *   description: WhatsApp webhook endpoints for Evolution API
 */

/**
 * @swagger
 * /webhooks/whatsapp:
 *   post:
 *     summary: Receive WhatsApp webhook events from Evolution API
 *     description: |
 *       This endpoint receives webhook events from Evolution API.
 *       Configure this URL in Evolution API webhook settings.
 *
 *       Supported events:
 *       - messages.upsert: New message received
 *       - connection.update: Connection state changed
 *       - qrcode.updated: QR code refreshed
 *     tags: [WhatsApp Webhook]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               event:
 *                 type: string
 *                 enum: [messages.upsert, messages.update, connection.update, qrcode.updated]
 *               instance:
 *                 type: string
 *               data:
 *                 type: object
 *     responses:
 *       200:
 *         description: Webhook processed successfully
 *       503:
 *         description: WhatsApp integration not configured
 */
whatsappWebhookRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    if (!whatsappWebhookController) {
      return res.status(503).json({
        status: 'error',
        message: 'WhatsApp integration is not configured',
      });
    }
    return whatsappWebhookController.handleWebhook(req, res);
  }),
);

/**
 * @swagger
 * /webhooks/whatsapp/health:
 *   get:
 *     summary: Check webhook endpoint health
 *     tags: [WhatsApp Webhook]
 *     responses:
 *       200:
 *         description: Webhook endpoint is healthy
 */
whatsappWebhookRouter.get('/health', (_req, res) => {
  return res.json({
    status: 'ok',
    configured: whatsappWebhookController !== null,
    timestamp: new Date().toISOString(),
  });
});

export { whatsappWebhookRouter };
