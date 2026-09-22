import { rejectAndRespond } from '../agents/field_note_agent';
import { ConversationState, REJECTION_KEYWORDS } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export async function whatsAppFieldNoteServiceHandleRejection(this: WhatsAppFieldNoteServiceContext, conversation: ConversationState, instanceName: string, phoneNumber: string, feedback: string): Promise<void> {
    await this.sendTypingIndicator(instanceName, phoneNumber);

    // If it's a simple "no", provide a generic feedback
    const normalizedFeedback = feedback.toLowerCase().trim();
    const isSimpleRejection = REJECTION_KEYWORDS.some((kw) => normalizedFeedback === kw);

    const feedbackMessage = isSimpleRejection
      ? 'Operazione annullata. Dimmi cosa vuoi modificare.'
      : feedback;

    const response = await rejectAndRespond(
      conversation.agentApp,
      conversation.threadId,
      feedbackMessage,
    );

    conversation.pendingApproval = response.status === 'REQUIRES_APPROVAL';

    if (response.status === 'REQUIRES_APPROVAL') {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        `${response.message}\n\n✅ Rispondi *sì* per confermare\n❌ Rispondi *no* o invia correzioni`,
      );
    } else {
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        response.message || 'Ok, dimmi come procedere.',
      );
    }
  }
