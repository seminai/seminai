import { FieldNoteAgentApp } from '../agents/field_note_agent';


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
export interface ConversationState {
  agentApp: FieldNoteAgentApp;
  threadId: string;
  lastActivity: Date;
  pendingApproval: boolean;
}


/**
 * Approval keywords that trigger confirmation.
 */
export const APPROVAL_KEYWORDS = ['sì', 'si', 'yes', 'ok', 'conferma', 'salva', 'approva', 'confermo'];


/**
 * Rejection keywords that trigger rejection.
 */
export const REJECTION_KEYWORDS = ['no', 'annulla', 'rifiuta', 'cancel', 'modifica', 'correggi'];
