import { approveAndExecute } from '../agents/field_note_agent';
import { ConversationState } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export async function whatsAppFieldNoteServiceHandleApproval(this: WhatsAppFieldNoteServiceContext, conversation: ConversationState, instanceName: string, phoneNumber: string): Promise<void> {
    await this.sendTypingIndicator(instanceName, phoneNumber);

    const response = await approveAndExecute(conversation.agentApp, conversation.threadId);

    conversation.pendingApproval = response.status === 'REQUIRES_APPROVAL';

    if (response.status === 'COMPLETED') {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `✅ ${response.message || 'Nota di campo salvata con successo!'}`,
      );
    } else if (response.status === 'REQUIRES_APPROVAL') {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `${response.message}\n\n✅ Rispondi *sì* per confermare\n❌ Rispondi *no* o invia correzioni`,
      );
    } else {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `❌ Errore durante il salvataggio: ${response.error || 'Errore sconosciuto'}`,
      );
    }
  }
