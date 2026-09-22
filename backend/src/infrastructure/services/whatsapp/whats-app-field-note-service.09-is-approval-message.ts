import { APPROVAL_KEYWORDS } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export function whatsAppFieldNoteServiceIsApprovalMessage(this: WhatsAppFieldNoteServiceContext, text: string): boolean {
    return APPROVAL_KEYWORDS.some((kw) => text === kw || text.startsWith(kw + ' '));
  }
