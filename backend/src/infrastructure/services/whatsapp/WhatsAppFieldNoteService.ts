/**
 * WhatsApp Field Note Service
 *
 * Integrates WhatsApp messaging with the Field Note Agent.
 * Handles incoming WhatsApp messages, processes them through the AI agent,
 * and sends responses back to the user.
 */

/**
 * WhatsApp Field Note Service
 *
 * Integrates WhatsApp messaging with the Field Note Agent.
 * Handles incoming WhatsApp messages, processes them through the AI agent,
 * and sends responses back to the user.
 */
import { PrismaClient } from '@prisma/client';
import { EvolutionApiService } from './EvolutionApiService';
import { ISettingsRepository } from '../../../domain/repositories/ISettingsRepository';
import { WhatsAppIncomingMessage, ConversationState } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';
import { whatsAppFieldNoteServiceProcessIncomingMessage } from './whats-app-field-note-service.01-process-incoming-message';
import { whatsAppFieldNoteServiceHandleNewMessage } from './whats-app-field-note-service.02-handle-new-message';
import { whatsAppFieldNoteServiceHandleApproval } from './whats-app-field-note-service.03-handle-approval';
import { whatsAppFieldNoteServiceHandleRejection } from './whats-app-field-note-service.04-handle-rejection';
import { whatsAppFieldNoteServiceSendWhatsAppMessage } from './whats-app-field-note-service.05-send-whats-app-message';
import { whatsAppFieldNoteServiceSendTypingIndicator } from './whats-app-field-note-service.06-send-typing-indicator';
import { whatsAppFieldNoteServiceExtractPhoneNumber } from './whats-app-field-note-service.07-extract-phone-number';
import { whatsAppFieldNoteServiceExtractMessageText } from './whats-app-field-note-service.08-extract-message-text';
import { whatsAppFieldNoteServiceIsApprovalMessage } from './whats-app-field-note-service.09-is-approval-message';
import { whatsAppFieldNoteServiceIsRejectionMessage } from './whats-app-field-note-service.10-is-rejection-message';
import { whatsAppFieldNoteServiceCleanupOldConversations } from './whats-app-field-note-service.11-cleanup-old-conversations';

export { type WhatsAppIncomingMessage } from './whats-app-field-note-service.support';

/**
 * Service class for handling WhatsApp messages with Field Note Agent.
 */
export class WhatsAppFieldNoteService {

  readonly prisma: PrismaClient;
  readonly evolutionApi: EvolutionApiService;
  readonly settingsRepository: ISettingsRepository;
  readonly conversations: Map<string, ConversationState> = new Map();
  readonly conversationTtlMs = 30 * 60 * 1000; // 30 minutes

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
    return whatsAppFieldNoteServiceProcessIncomingMessage.call(this as unknown as WhatsAppFieldNoteServiceContext, message);
  }

  /**
   * Handle a new message (not an approval/rejection).
   */
  async handleNewMessage(
    conversation: ConversationState,
    instanceName: string,
    phoneNumber: string,
    messageText: string,
  ): Promise<void> {
    return whatsAppFieldNoteServiceHandleNewMessage.call(this as unknown as WhatsAppFieldNoteServiceContext, conversation, instanceName, phoneNumber, messageText);
  }

  /**
   * Handle approval response from user.
   */
  async handleApproval(
    conversation: ConversationState,
    instanceName: string,
    phoneNumber: string,
  ): Promise<void> {
    return whatsAppFieldNoteServiceHandleApproval.call(this as unknown as WhatsAppFieldNoteServiceContext, conversation, instanceName, phoneNumber);
  }

  /**
   * Handle rejection/feedback response from user.
   */
  async handleRejection(
    conversation: ConversationState,
    instanceName: string,
    phoneNumber: string,
    feedback: string,
  ): Promise<void> {
    return whatsAppFieldNoteServiceHandleRejection.call(this as unknown as WhatsAppFieldNoteServiceContext, conversation, instanceName, phoneNumber, feedback);
  }

  /**
   * Send a WhatsApp message.
   */
  async sendWhatsAppMessage(
    instanceName: string,
    phoneNumber: string,
    text: string,
  ): Promise<void> {
    return whatsAppFieldNoteServiceSendWhatsAppMessage.call(this as unknown as WhatsAppFieldNoteServiceContext, instanceName, phoneNumber, text);
  }

  /**
   * Send typing indicator.
   * @param _instanceName Instance name (reserved for future use)
   * @param _phoneNumber Phone number (reserved for future use)
   */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async sendTypingIndicator(_instanceName: string, _phoneNumber: string): Promise<void> {
    return whatsAppFieldNoteServiceSendTypingIndicator.call(this as unknown as WhatsAppFieldNoteServiceContext, _instanceName, _phoneNumber);
  }

  /**
   * Extract phone number from WhatsApp JID.
   */
  extractPhoneNumber(remoteJid: string): string {
    return whatsAppFieldNoteServiceExtractPhoneNumber.call(this as unknown as WhatsAppFieldNoteServiceContext, remoteJid);
  }

  /**
   * Extract text content from message.
   */
  extractMessageText(message: WhatsAppIncomingMessage): string | null {
    return whatsAppFieldNoteServiceExtractMessageText.call(this as unknown as WhatsAppFieldNoteServiceContext, message);
  }

  /**
   * Check if message is an approval.
   */
  isApprovalMessage(text: string): boolean {
    return whatsAppFieldNoteServiceIsApprovalMessage.call(this as unknown as WhatsAppFieldNoteServiceContext, text);
  }

  /**
   * Check if message is a rejection.
   */
  isRejectionMessage(text: string): boolean {
    return whatsAppFieldNoteServiceIsRejectionMessage.call(this as unknown as WhatsAppFieldNoteServiceContext, text);
  }

  /**
   * Cleanup old conversations to free memory.
   */
  cleanupOldConversations(): void {
    whatsAppFieldNoteServiceCleanupOldConversations.call(this as unknown as WhatsAppFieldNoteServiceContext);
  }
}
