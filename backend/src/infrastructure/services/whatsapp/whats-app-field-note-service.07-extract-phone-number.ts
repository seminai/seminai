import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export function whatsAppFieldNoteServiceExtractPhoneNumber(this: WhatsAppFieldNoteServiceContext, remoteJid: string): string {
    // Format: 39331234567@s.whatsapp.net
    return remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '');
  }
