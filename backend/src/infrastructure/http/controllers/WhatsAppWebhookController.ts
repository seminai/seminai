/**
 * WhatsApp Webhook Controller
 *
 * Handles incoming webhooks from Evolution API for WhatsApp messages.
 */

import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import {
  WhatsAppFieldNoteService,
  WhatsAppIncomingMessage,
} from '../../services/whatsapp/WhatsAppFieldNoteService';
import { EvolutionApiService } from '../../services/whatsapp/EvolutionApiService';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';

/**
 * Evolution API webhook event types.
 */
type WebhookEventType =
  | 'messages.upsert'
  | 'messages.update'
  | 'connection.update'
  | 'qrcode.updated'
  | 'presence.update';

/**
 * Evolution API webhook payload structure.
 */
interface EvolutionWebhookPayload {
  event: WebhookEventType;
  instance: string;
  data: unknown;
}

/**
 * Messages upsert event data.
 */
interface MessagesUpsertData {
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
  pushName?: string;
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageType: string;
  messageTimestamp: number;
}

/**
 * Connection update event data.
 */
interface ConnectionUpdateData {
  instance: string;
  state: 'open' | 'close' | 'connecting';
  statusReason?: number;
}

/**
 * Controller for handling WhatsApp webhooks from Evolution API.
 */
export class WhatsAppWebhookController {
  private readonly fieldNoteService: WhatsAppFieldNoteService;
  private readonly settingsRepository: ISettingsRepository;

  constructor(
    prisma: PrismaClient,
    evolutionApi: EvolutionApiService,
    settingsRepository: ISettingsRepository,
  ) {
    this.fieldNoteService = new WhatsAppFieldNoteService(prisma, evolutionApi, settingsRepository);
    this.settingsRepository = settingsRepository;
  }

  /**
   * Handle incoming webhook from Evolution API.
   */
  async handleWebhook(request: Request, response: Response): Promise<Response> {
    const payload = request.body as EvolutionWebhookPayload;

    console.log(
      `[WhatsAppWebhook] Received event: ${payload.event} for instance: ${payload.instance}`,
    );

    try {
      switch (payload.event) {
        case 'messages.upsert':
          await this.handleMessagesUpsert(payload.instance, payload.data as MessagesUpsertData);
          break;

        case 'connection.update':
          await this.handleConnectionUpdate(payload.instance, payload.data as ConnectionUpdateData);
          break;

        case 'qrcode.updated':
          console.log(`[WhatsAppWebhook] QR code updated for instance: ${payload.instance}`);
          break;

        default:
          console.log(`[WhatsAppWebhook] Unhandled event type: ${payload.event}`);
      }

      return response.status(200).json({ status: 'ok' });
    } catch (error) {
      console.error('[WhatsAppWebhook] Error processing webhook:', error);
      // Return 200 to avoid Evolution API retrying
      return response.status(200).json({ status: 'error', message: 'Internal error' });
    }
  }

  /**
   * Handle messages.upsert event (new message received).
   */
  private async handleMessagesUpsert(
    instanceName: string,
    data: MessagesUpsertData,
  ): Promise<void> {
    // Only process text messages
    if (data.messageType !== 'conversation' && data.messageType !== 'extendedTextMessage') {
      console.log(`[WhatsAppWebhook] Ignoring message type: ${data.messageType}`);
      return;
    }

    // Ignore messages from groups for now
    if (data.key.remoteJid.includes('@g.us')) {
      console.log('[WhatsAppWebhook] Ignoring group message');
      return;
    }

    // Ignore messages sent by us
    if (data.key.fromMe) {
      return;
    }

    // Check allowlist: only process messages from allowed numbers
    const senderNumber = data.key.remoteJid.replace('@s.whatsapp.net', '');
    const settings = await this.settingsRepository.findByWhatsappInstanceName(instanceName);

    if (settings && !settings.isPhoneNumberAllowed(senderNumber)) {
      console.log(`[WhatsAppWebhook] Ignoring message from non-allowed number: ${senderNumber}`);
      return;
    }

    const incomingMessage: WhatsAppIncomingMessage = {
      instanceName,
      sender: data.key.remoteJid,
      pushName: data.pushName,
      message: data.message,
      messageType: data.messageType,
      messageTimestamp: data.messageTimestamp,
      key: data.key,
    };

    await this.fieldNoteService.processIncomingMessage(incomingMessage);
  }

  /**
   * Handle connection.update event (connection state changed).
   */
  private async handleConnectionUpdate(
    instanceName: string,
    data: ConnectionUpdateData,
  ): Promise<void> {
    console.log(`[WhatsAppWebhook] Connection update for ${instanceName}: ${data.state}`);

    // Find settings by instance name and update connection status
    const settings = await this.settingsRepository.findByWhatsappInstanceName(instanceName);

    if (settings) {
      const isConnected = data.state === 'open';

      if (settings.whatsappConnected !== isConnected) {
        await this.settingsRepository.updateWhatsAppConfig(settings.id, {
          whatsappConnected: isConnected,
          whatsappLastSync: new Date(),
        });

        console.log(
          `[WhatsAppWebhook] Updated connection status for ${instanceName}: ${isConnected}`,
        );
      }
    }
  }
}
