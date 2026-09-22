import { BotContext, ChatResponse, Questionnaire } from '../types';
import { seminaiClient } from '../api/SeminaiClient';
import { isAuthenticated, generateThreadId } from '../session';
import {
  createMainMenuKeyboard,
  createApprovalKeyboard,
  createChatMenuKeyboard,
  createBackToMenuKeyboard,
} from '../keyboards';

/**
 * Format agent message for user display by removing UUIDs and technical details.
 * Keeps only human-readable information.
 */
function formatAgentMessage(message: string): string {
  if (!message) return message;

  // Split into lines and filter out lines containing UUIDs or technical IDs
  const lines = message.split('\n');
  const filteredLines = lines.filter((line) => {
    const trimmed = line.trim();
    // Skip lines that contain " ID:" (like "Campo ID:", "Unità Produttiva ID:")
    if (trimmed.includes(' ID:')) return false;
    // Skip lines that are just UUIDs
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(trimmed))
      return false;
    return true;
  });

  return filteredLines.join('\n').trim();
}

function formatQuestionnaire(questionnaire: Questionnaire): string {
  const lines = [
    '',
    questionnaire.title,
    ...(questionnaire.description ? [questionnaire.description] : []),
  ];
  questionnaire.questions.forEach((question, index) => {
    const requiredLabel = question.required ? ' (obbligatoria)' : '';
    lines.push('', `${index + 1}. ${question.question}${requiredLabel}`);
    if (question.options && question.options.length > 0) {
      question.options.forEach((option, optionIndex) => {
        const description = option.description ? ` - ${option.description}` : '';
        lines.push(`   ${optionIndex + 1}. ${option.label}${description}`);
      });
    }
    if (question.type === 'multi_select') {
      lines.push('   Puoi indicare una o piu opzioni.');
    }
    if (question.placeholder) {
      lines.push(`   Esempio: ${question.placeholder}`);
    }
  });
  lines.push('', 'Rispondi scrivendo le tue scelte in un messaggio.');
  return lines.join('\n').trim();
}

function appendSources(message: string, sources: ChatResponse['sources']): string {
  if (!sources || sources.length === 0) {
    return message;
  }
  const sourceLines = sources.slice(0, 3).map((source) => `- ${source.title}`);
  return `${message}\n\nFonti:\n${sourceLines.join('\n')}`;
}

function buildChatReply(response: ChatResponse, fallbackMessage: string): string {
  const rawMessage = response.message || response.error || fallbackMessage;
  const cleanMessage = formatAgentMessage(rawMessage) || fallbackMessage;
  const messageWithQuestionnaire = response.questionnaire
    ? `${cleanMessage}\n\n${formatQuestionnaire(response.questionnaire)}`
    : cleanMessage;
  return appendSources(messageWithQuestionnaire, response.sources);
}

export async function handleChatStart(ctx: BotContext): Promise<void> {
  if (!isAuthenticated(ctx.session)) {
    await ctx.reply('Devi prima autenticarti. Usa /start');
    return;
  }

  // Generate new thread ID
  ctx.session.chatThreadId = generateThreadId(ctx.chat!.id);
  ctx.session.pendingApproval = false;

  await ctx.editMessageText(
    '💬 Chat SeminAI attiva!\n\n' +
      'Puoi chiedere supporto su:\n' +
      '- Pianificazione trattamenti e dosaggi\n' +
      '- Prodotti disponibili e magazzino\n' +
      '- Note e operazioni aziendali\n' +
      '- Dubbi agronomici sui tuoi dati\n\n' +
      'Esempio: "Pianifica un trattamento per la vite contro peronospora"\n\n' +
      'Scrivi la tua richiesta:',
    { reply_markup: createBackToMenuKeyboard() },
  );
}

export async function handleChatMessage(ctx: BotContext, message: string): Promise<void> {
  if (!isAuthenticated(ctx.session)) {
    await ctx.reply('Devi prima autenticarti. Usa /start');
    return;
  }

  // If there's a pending approval, check for approval/rejection keywords
  if (ctx.session.pendingApproval) {
    const lowerMessage = message.toLowerCase().trim();
    const approvalWords = ['si', 'yes', 'ok', 'approva', 'conferma'];
    const rejectionWords = ['no', 'annulla', 'rifiuta', 'cancel'];

    if (approvalWords.includes(lowerMessage)) {
      await handleChatApprove(ctx);
      return;
    }
    if (rejectionWords.includes(lowerMessage)) {
      await handleChatReject(ctx);
      return;
    }
  }

  // Create thread if not exists
  if (!ctx.session.chatThreadId) {
    ctx.session.chatThreadId = generateThreadId(ctx.chat!.id);
  }

  await ctx.reply('Elaboro la tua richiesta...');

  try {
    const response = await seminaiClient.sendChatMessage(
      ctx.session.token!,
      ctx.session.chatThreadId,
      message,
    );

    if (response.status === 'REQUIRES_APPROVAL') {
      ctx.session.pendingApproval = true;
      const cleanMessage = buildChatReply(
        response,
        "L'assistente richiede approvazione per procedere.",
      );

      await ctx.reply(cleanMessage + '\n\nVuoi procedere?', {
        reply_markup: createApprovalKeyboard(),
      });
      return;
    }

    ctx.session.pendingApproval = false;

    const replyMessage = buildChatReply(response, 'Nessuna risposta disponibile.');

    await ctx.reply(replyMessage, { reply_markup: createChatMenuKeyboard() });
  } catch (error) {
    console.error('Chat error:', error);
    await ctx.reply('Si e verificato un errore. Riprova o torna al menu.', {
      reply_markup: createMainMenuKeyboard(),
    });
  }
}

export async function handleChatApprove(ctx: BotContext): Promise<void> {
  if (!isAuthenticated(ctx.session) || !ctx.session.chatThreadId) {
    await ctx.reply('Sessione non valida. Usa /start');
    return;
  }

  await ctx.reply("Eseguo l'operazione...");

  try {
    const response = await seminaiClient.approveChatAction(
      ctx.session.token!,
      ctx.session.chatThreadId,
    );

    // Check if another approval is needed
    if (response.status === 'REQUIRES_APPROVAL') {
      ctx.session.pendingApproval = true;
      const cleanMessage = buildChatReply(response, 'Richiesta ulteriore approvazione.');

      await ctx.reply(cleanMessage + '\n\nVuoi procedere?', {
        reply_markup: createApprovalKeyboard(),
      });
      return;
    }

    ctx.session.pendingApproval = false;

    const replyMessage = buildChatReply(response, 'Operazione completata.');

    await ctx.reply(replyMessage, { reply_markup: createChatMenuKeyboard() });
  } catch (error) {
    console.error('Approve error:', error);
    ctx.session.pendingApproval = false;
    await ctx.reply("Errore nell'esecuzione. Riprova.", {
      reply_markup: createChatMenuKeyboard(),
    });
  }
}

export async function handleChatReject(ctx: BotContext): Promise<void> {
  if (!isAuthenticated(ctx.session) || !ctx.session.chatThreadId) {
    await ctx.reply('Sessione non valida. Usa /start');
    return;
  }

  try {
    const response = await seminaiClient.rejectChatAction(
      ctx.session.token!,
      ctx.session.chatThreadId,
      "Rifiutato dall'utente",
    );

    ctx.session.pendingApproval = false;

    const replyMessage = buildChatReply(response, 'Operazione annullata. Cosa vuoi fare?');

    await ctx.reply(replyMessage, {
      reply_markup: createChatMenuKeyboard(),
    });
  } catch (error) {
    console.error('Reject error:', error);
    ctx.session.pendingApproval = false;
    await ctx.reply('Operazione annullata.', { reply_markup: createChatMenuKeyboard() });
  }
}

export async function handleNewChat(ctx: BotContext): Promise<void> {
  ctx.session.chatThreadId = generateThreadId(ctx.chat!.id);
  ctx.session.pendingApproval = false;

  await ctx.editMessageText('💬 Nuova conversazione Chat SeminAI!\n\nScrivi la tua richiesta:', {
    reply_markup: createBackToMenuKeyboard(),
  });
}
