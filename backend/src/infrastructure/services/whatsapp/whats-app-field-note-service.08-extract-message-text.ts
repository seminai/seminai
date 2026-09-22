import { WhatsAppIncomingMessage } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export function whatsAppFieldNoteServiceExtractMessageText(this: WhatsAppFieldNoteServiceContext, message: WhatsAppIncomingMessage): string | null {
    if (message.message.conversation) {
      return message.message.conversation;
    }
    if (message.message.extendedTextMessage?.text) {
      return message.message.extendedTextMessage.text;
    }
    return null;
  }
