import { BotContext } from '../types';
import { seminaiClient } from '../api/SeminaiClient';
import { isAuthenticated, generateThreadId } from '../session';
import { handleChatMessage } from './chat';

/**
 * Handle voice messages by transcribing them and processing as chat messages.
 */
export async function handleVoiceMessage(ctx: BotContext): Promise<void> {
  console.log('[handleVoiceMessage] Called');

  if (!isAuthenticated(ctx.session)) {
    await ctx.reply('Devi prima autenticarti. Usa /start');
    return;
  }

  const voice = ctx.message?.voice;
  if (!voice) {
    console.log('[handleVoiceMessage] No voice in message');
    return;
  }

  console.log(`[handleVoiceMessage] Voice file_id: ${voice.file_id}, duration: ${voice.duration}s`);

  // Check duration limit (max 2 minutes to avoid timeout)
  if (voice.duration > 120) {
    await ctx.reply(
      'Il messaggio vocale e troppo lungo (max 2 minuti).\n' +
        'Prova a registrare un messaggio piu breve.',
    );
    return;
  }

  await ctx.reply('Trascrivo il messaggio vocale...');

  try {
    // Get file from Telegram
    const file = await ctx.getFile();
    console.log(`[handleVoiceMessage] File path: ${file.file_path}`);

    // Download file
    const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
    const response = await fetch(fileUrl);

    if (!response.ok) {
      throw new Error(`Failed to download voice file: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    console.log(`[handleVoiceMessage] Downloaded ${audioBuffer.length} bytes`);

    // Transcribe audio
    const transcription = await seminaiClient.transcribeAudio(
      ctx.session.token!,
      audioBuffer,
      'voice.ogg',
    );

    console.log(`[handleVoiceMessage] Transcription: "${transcription.text}"`);

    if (!transcription.text || transcription.text.trim().length === 0) {
      await ctx.reply('Non sono riuscito a trascrivere il messaggio vocale. Riprova.');
      return;
    }

    // Ensure we have a chat thread
    if (!ctx.session.chatThreadId) {
      ctx.session.chatThreadId = generateThreadId(ctx.chat!.id);
    }

    // Show transcription and process as chat message
    await ctx.reply(`Hai detto: "${transcription.text}"\n\nElaborazione in corso...`);

    // Process the transcribed text as a chat message
    await handleChatMessage(ctx, transcription.text);
  } catch (error) {
    console.error('[handleVoiceMessage] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await ctx.reply(`Errore nella trascrizione: ${errorMessage}\n\nRiprova o scrivi il messaggio.`);
  }
}
