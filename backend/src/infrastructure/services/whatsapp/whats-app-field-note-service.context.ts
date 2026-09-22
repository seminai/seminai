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

export interface WhatsAppFieldNoteServiceContext {
  readonly prisma: PrismaClient;
  readonly evolutionApi: EvolutionApiService;
  readonly settingsRepository: ISettingsRepository;
  readonly conversations: Map<string, ConversationState>;
  readonly conversationTtlMs: number;
  processIncomingMessage(message: WhatsAppIncomingMessage): Promise<void>;
  handleNewMessage(conversation: ConversationState, instanceName: string, phoneNumber: string, messageText: string): Promise<void>;
  handleApproval(conversation: ConversationState, instanceName: string, phoneNumber: string): Promise<void>;
  handleRejection(conversation: ConversationState, instanceName: string, phoneNumber: string, feedback: string): Promise<void>;
  sendWhatsAppMessage(instanceName: string, phoneNumber: string, text: string): Promise<void>;
  sendTypingIndicator(_instanceName: string, _phoneNumber: string): Promise<void>;
  extractPhoneNumber(remoteJid: string): string;
  extractMessageText(message: WhatsAppIncomingMessage): string | null;
  isApprovalMessage(text: string): boolean;
  isRejectionMessage(text: string): boolean;
  cleanupOldConversations(): void;
}
