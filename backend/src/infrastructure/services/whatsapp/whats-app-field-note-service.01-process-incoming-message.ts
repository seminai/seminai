import { createFieldNoteAgentApp } from '../agents/field_note_agent';
import { WhatsAppIncomingMessage } from './whats-app-field-note-service.support';
import type { WhatsAppFieldNoteServiceContext } from './whats-app-field-note-service.context';

export async function whatsAppFieldNoteServiceProcessIncomingMessage(this: WhatsAppFieldNoteServiceContext, message: WhatsAppIncomingMessage): Promise<void> {
    const { instanceName, key } = message;
    const phoneNumber = this.extractPhoneNumber(key.remoteJid);
    const messageText = this.extractMessageText(message);

    if (!messageText) {
      console.log('[WhatsAppFieldNote] Received non-text message, ignoring');
      return;
    }

    // Ignore messages sent by us
    if (key.fromMe) {
      console.log('[WhatsAppFieldNote] Ignoring message sent by us');
      return;
    }

    console.log(`[WhatsAppFieldNote] Processing message from ${phoneNumber}: "${messageText}"`);

    try {
      // Find the user associated with this WhatsApp instance
      const settings = await this.settingsRepository.findByWhatsappInstanceName(instanceName);

      if (!settings) {
        console.log(`[WhatsAppFieldNote] No settings found for instance: ${instanceName}`);
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          '❌ Questo numero WhatsApp non è collegato a nessun account. Configura WhatsApp nelle impostazioni.',
        );
        return;
      }

      const userId = settings.userId;
      const conversationKey = `${instanceName}:${phoneNumber}`;

      // Get or create conversation state
      let conversation = this.conversations.get(conversationKey);

      if (!conversation) {
        console.log(`[WhatsAppFieldNote] Creating new conversation for ${conversationKey}`);
        const agentApp = createFieldNoteAgentApp({
          userId,
          prisma: this.prisma,
          modelName: 'gpt-4o',
          temperature: 0.1,
        });

        const threadId = `whatsapp_${instanceName}_${phoneNumber}_${Date.now()}`;

        conversation = {
          agentApp,
          threadId,
          lastActivity: new Date(),
          pendingApproval: false,
        };

        this.conversations.set(conversationKey, conversation);

        // Send welcome message
        await this.sendWhatsAppMessage(
          instanceName,
          phoneNumber,
          '👋 Ciao! Sono il tuo assistente per le note di campo.\n\n' +
            '📝 Puoi inviarmi messaggi come:\n' +
            '• "Ho dato 10 kg di rame nel campo vite"\n' +
            '• "Notata peronospora nel vigneto nord"\n' +
            '• "Raccolto 50 quintali di uva nel campo sud"\n\n' +
            'Analizzerò il tuo messaggio e ti chiederò conferma prima di salvare.',
        );
      }

      conversation.lastActivity = new Date();

      // Check if this is an approval/rejection response
      const normalizedText = messageText.toLowerCase().trim();

      if (conversation.pendingApproval) {
        if (this.isApprovalMessage(normalizedText)) {
          await this.handleApproval(conversation, instanceName, phoneNumber);
          return;
        }

        if (this.isRejectionMessage(normalizedText)) {
          await this.handleRejection(conversation, instanceName, phoneNumber, messageText);
          return;
        }

        // Treat as correction/feedback
        await this.handleRejection(conversation, instanceName, phoneNumber, messageText);
        return;
      }

      // Process the message with the agent
      await this.handleNewMessage(conversation, instanceName, phoneNumber, messageText);
    } catch (error) {
      console.error('[WhatsAppFieldNote] Error processing message:', error);
      await this.sendWhatsAppMessage(
        instanceName,
        phoneNumber,
        "❌ Si è verificato un errore durante l'elaborazione del messaggio. Riprova più tardi.",
      );
    }
  }
