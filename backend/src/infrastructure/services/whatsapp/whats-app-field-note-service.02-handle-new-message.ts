import { handleUserMessage } from '../agents/field_note_agent';
import { ConversationState } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export async function whatsAppFieldNoteServiceHandleNewMessage(this: WhatsAppFieldNoteServiceContext, conversation: ConversationState, instanceName: string, phoneNumber: string, messageText: string): Promise<void> {
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
