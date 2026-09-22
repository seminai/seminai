import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export async function whatsAppFieldNoteServiceSendWhatsAppMessage(this: WhatsAppFieldNoteServiceContext, instanceName: string, phoneNumber: string, text: string): Promise<void> {
    try {
      await this.evolutionApi.sendTextMessage(instanceName, {
        number: phoneNumber,
        text,
      });
    } catch (error) {
      console.error('[WhatsAppFieldNote] Failed to send message:', error);
    }
  }
