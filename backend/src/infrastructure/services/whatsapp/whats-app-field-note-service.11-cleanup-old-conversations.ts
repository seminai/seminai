import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export function whatsAppFieldNoteServiceCleanupOldConversations(this: WhatsAppFieldNoteServiceContext): void {
    const now = Date.now();
    for (const [key, conversation] of this.conversations.entries()) {
      if (now - conversation.lastActivity.getTime() > this.conversationTtlMs) {
        console.log(`[WhatsAppFieldNote] Cleaning up old conversation: ${key}`);
        this.conversations.delete(key);
      }
    }
  }
