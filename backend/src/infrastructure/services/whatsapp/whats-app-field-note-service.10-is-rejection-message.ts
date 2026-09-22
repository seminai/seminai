import { REJECTION_KEYWORDS } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export function whatsAppFieldNoteServiceIsRejectionMessage(this: WhatsAppFieldNoteServiceContext, text: string): boolean {
    return REJECTION_KEYWORDS.some((kw) => text === kw);
  }
