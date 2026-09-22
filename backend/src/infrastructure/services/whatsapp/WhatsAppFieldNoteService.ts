/**
 * WhatsApp Field Note Service
 *
 * Integrates WhatsApp messaging with the Field Note Agent.
 * Handles incoming WhatsApp messages, processes them through the AI agent,
 * and sends responses back to the user.
 */

import { PrismaClient } from '@prisma/client';
import {
  createFieldNoteAgentApp,
  handleUserMessage,
  approveAndExecute,
  rejectAndRespond,
  FieldNoteAgentApp,
} from '../agents/field_note_agent';
import { EvolutionApiService } from './EvolutionApiService';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';

/**
 * Incoming WhatsApp message from Evolution API webhook.
 */
export interface WhatsAppIncomingMessage {
  instanceName: string;
  sender: string;
  pushName?: string;
  message: {
    conversation?: string;
    extendedTextMessage?: {
      text: string;
    };
  };
  messageType: string;
  messageTimestamp: number;
  key: {
    remoteJid: string;
    fromMe: boolean;
    id: string;
  };
}

/**
 * Conversation state stored in memory for managing agent threads.
 */
interface ConversationState {
  agentApp: FieldNoteAgentApp;
  threadId: string;
  lastActivity: Date;
  pendingApproval: boolean;
}

/**
 * Approval keywords that trigger confirmation.
 */
const APPROVAL_KEYWORDS = ['sì', 'si', 'yes', 'ok', 'conferma', 'salva', 'approva', 'confermo'];

/**
 * Rejection keywords that trigger rejection.
 */
const REJECTION_KEYWORDS = ['no', 'annulla', 'rifiuta', 'cancel', 'modifica', 'correggi'];

/**
 * Service class for handling WhatsApp messages with Field Note Agent.
 */
export class WhatsAppFieldNoteService {
  private readonly prisma: PrismaClient;
  private readonly evolutionApi: EvolutionApiService;
  private readonly settingsRepository: ISettingsRepository;
  private readonly conversations: Map<string, ConversationState> = new Map();
  private readonly conversationTtlMs = 30 * 60 * 1000; // 30 minutes

  constructor(
    prisma: PrismaClient,
    evolutionApi: EvolutionApiService,
    settingsRepository: ISettingsRepository,
  ) {
    this.prisma = prisma;
    this.evolutionApi = evolutionApi;
    this.settingsRepository = settingsRepository;

    // Cleanup old conversations periodically
    setInterval(() => this.cleanupOldConversations(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Process an incoming WhatsApp message.
   */
  async processIncomingMessage(message: WhatsAppIncomingMessage): Promise<void> {
    const { instanceName, key } = message;
    const phoneNumber = this.extractPhoneNumber(key.remoteJid);
    const messageText = this.extractMessageText(message);

    if (!messageText) {
      console.log('[WhatsAppFieldNote] Received non-text message, ignoring');
      return;
    }

    // Ignore messages sent by us
    if (key.fromMe) {
      console.log('[WhatsAppFieldNote] Ignoring message sent by us');
      return;
    }

    console.log(`[WhatsAppFieldNote] Processing message from ${phoneNumber}: "${messageText}"`);

    try {
      // Find the user associated with this WhatsApp instance
      const settings = await this.settingsRepository.findByWhatsappInstanceName(instanceName);

      if (!settings) {
        console.log(`[WhatsAppFieldNote] No settings found for instance: ${instanceName}`);
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          '❌ Questo numero WhatsApp non è collegato a nessun account. Configura WhatsApp nelle impostazioni.',
        );
        return;
      }

      const userId = settings.userId;
      const conversationKey = `${instanceName}:${phoneNumber}`;

      // Get or create conversation state
      let conversation = this.conversations.get(conversationKey);

      if (!conversation) {
        console.log(`[WhatsAppFieldNote] Creating new conversation for ${conversationKey}`);
        const agentApp = createFieldNoteAgentApp({
          userId,
          prisma: this.prisma,
          modelName: 'gpt-4o',
          temperature: 0.1,
        });

        const threadId = `whatsapp_${instanceName}_${phoneNumber}_${Date.now()}`;

        conversation = {
          agentApp,
          threadId,
          lastActivity: new Date(),
          pendingApproval: false,
        };

        this.conversations.set(conversationKey, conversation);

        // Send welcome message
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          '👋 Ciao! Sono il tuo assistente per le note di campo.\n\n' +
            '📝 Puoi inviarmi messaggi come:\n' +
            '• "Ho dato 10 kg di rame nel campo vite"\n' +
            '• "Notata peronospora nel vigneto nord"\n' +
            '• "Raccolto 50 quintali di uva nel campo sud"\n\n' +
            'Analizzerò il tuo messaggio e ti chiederò conferma prima di salvare.',
        );
      }

      conversation.lastActivity = new Date();

      // Check if this is an approval/rejection response
      const normalizedText = messageText.toLowerCase().trim();

      if (conversation.pendingApproval) {
        if (this.isApprovalMessage(normalizedText)) {
          await this.handleApproval(conversation, instanceName, phoneNumber);
          return;
        }

        if (this.isRejectionMessage(normalizedText)) {
          await this.handleRejection(conversation, instanceName, phoneNumber, messageText);
          return;
        }

        // Treat as correction/feedback
        await this.handleRejection(conversation, instanceName, phoneNumber, messageText);
        return;
      }

      // Process the message with the agent
      await this.handleNewMessage(conversation, instanceName, phoneNumber, messageText);
    } catch (error) {
      console.error('[WhatsAppFieldNote] Error processing message:', error);
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        "❌ Si è verificato un errore durante l'elaborazione del messaggio. Riprova più tardi.",
      );
    }
  }

  /**
   * Handle a new message (not an approval/rejection).
   */
  private async handleNewMessage(
    conversation: ConversationState,
    instanceName: string,
    phoneNumber: string,
    messageText: string,
  ): Promise<void> {
    // Send typing indicator
    await this.sendTypingIndicator(instanceName, phoneNumber);

    const response = await handleUserMessage(
      conversation.agentApp,
      conversation.threadId,
      messageText,
    );

    console.log(`[WhatsAppFieldNote] Agent response status: ${response.status}`);

    switch (response.status) {
      case 'REQUIRES_APPROVAL':
        conversation.pendingApproval = true;
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          `${response.message}\n\n✅ Rispondi *sì* per confermare\n❌ Rispondi *no* o invia correzioni`,
        );
        break;

      case 'COMPLETED':
        conversation.pendingApproval = false;
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          response.message || 'Operazione completata.',
        );
        break;

      case 'ERROR':
        conversation.pendingApproval = false;
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          `❌ Errore: ${response.error || 'Si è verificato un errore.'}`,
        );
        break;
    }
  }

  /**
   * Handle approval response from user.
   */
  private async handleApproval(
    conversation: ConversationState,
    instanceName: string,
    phoneNumber: string,
  ): Promise<void> {
    await this.sendTypingIndicator(instanceName, phoneNumber);

    const response = await approveAndExecute(conversation.agentApp, conversation.threadId);

    conversation.pendingApproval = response.status === 'REQUIRES_APPROVAL';

    if (response.status === 'COMPLETED') {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `✅ ${response.message || 'Nota di campo salvata con successo!'}`,
      );
    } else if (response.status === 'REQUIRES_APPROVAL') {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `${response.message}\n\n✅ Rispondi *sì* per confermare\n❌ Rispondi *no* o invia correzioni`,
      );
    } else {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `❌ Errore durante il salvataggio: ${response.error || 'Errore sconosciuto'}`,
      );
    }
  }

  /**
   * Handle rejection/feedback response from user.
   */
  private async handleRejection(
    conversation: ConversationState,
    instanceName: string,
    phoneNumber: string,
    feedback: string,
  ): Promise<void> {
    await this.sendTypingIndicator(instanceName, phoneNumber);

    // If it's a simple "no", provide a generic feedback
    const normalizedFeedback = feedback.toLowerCase().trim();
    const isSimpleRejection = REJECTION_KEYWORDS.some((kw) => normalizedFeedback === kw);

    const feedbackMessage = isSimpleRejection
      ? 'Operazione annullata. Dimmi cosa vuoi modificare.'
      : feedback;

    const response = await rejectAndRespond(
      conversation.agentApp,
      conversation.threadId,
      feedbackMessage,
    );

    conversation.pendingApproval = response.status === 'REQUIRES_APPROVAL';

    if (response.status === 'REQUIRES_APPROVAL') {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `${response.message}\n\n✅ Rispondi *sì* per confermare\n❌ Rispondi *no* o invia correzioni`,
      );
    } else {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        response.message || 'Ok, dimmi come procedere.',
      );
    }
  }

  /**
   * Send a WhatsApp message.
   */
  private async sendWhatsAppMessage(
    instanceName: string,
    phoneNumber: string,
    text: string,
  ): Promise<void> {
    try {
      await this.evolutionApi.sendTextMessage(instanceName, {
        number: phoneNumber,
        text,
      });
    } catch (error) {
      console.error('[WhatsAppFieldNote] Failed to send message:', error);
    }
  }

  /**
   * Send typing indicator.
   * @param _instanceName Instance name (reserved for future use)
   * @param _phoneNumber Phone number (reserved for future use)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async sendTypingIndicator(_instanceName: string, _phoneNumber: string): Promise<void> {
    // Evolution API might support presence/typing indicators
    // This is a placeholder - implement if Evolution API supports it
  }

  /**
   * Extract phone number from WhatsApp JID.
   */
  private extractPhoneNumber(remoteJid: string): string {
    // Format: 39331234567@s.whatsapp.net
    return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }

  /**
   * Extract text content from message.
   */
  private extractMessageText(message: WhatsAppIncomingMessage): string | null {
    if (message.message.conversation) {
      return message.message.conversation;
    }
    if (message.message.extendedTextMessage?.text) {
      return message.message.extendedTextMessage.text;
    }
    return null;
  }

  /**
   * Check if message is an approval.
   */
  private isApprovalMessage(text: string): boolean {
    return APPROVAL_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' '));
  }

  /**
   * Check if message is a rejection.
   */
  private isRejectionMessage(text: string): boolean {
    return REJECTION_KEYWORDS.some((kw) => text === kw);
  }

  /**
   * Cleanup old conversations to free memory.
   */
  private cleanupOldConversations(): void {
    const now = Date.now();
    for (const [key, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActivity.getTime() > this.conversationTtlMs) {
        console.log(`[WhatsAppFieldNote] Cleaning up old conversation: ${key}`);
        this.conversations.delete(key);
      }
    }
  }
}
