import { Bot, session } from 'grammy';
import { config } from './config';
import { BotContext } from './types';
import { createInitialSession, isAuthenticated } from './session';
import { handleStart, handleContact } from './handlers/start';
import { handleChatMessage } from './handlers/chat';
import { handleCallback } from './handlers/callback';
import { handleVoiceMessage } from './handlers/voice';

export function createBot(): Bot<BotContext> {
  const bot = new Bot<BotContext>(config.telegramToken);

  // Log all updates for debugging
  bot.use(async (ctx, next) => {
    const updateType = ctx.message ? 'message' : ctx.callbackQuery ? 'callback' : 'other';
    console.log(
      `[Update] Type: ${updateType}, From: ${ctx.from?.id}, Text: ${ctx.message?.text || ''}`,
    );
    await next();
  });

  // Session middleware
  bot.use(
    session({
      initial: createInitialSession,
    }),
  );

  // Error handling
  bot.catch((err) => {
    console.error('[Bot Error]', err);
  });

  // Commands
  bot.command('start', handleStart);
  bot.command('menu', async (ctx) => {
    if (!isAuthenticated(ctx.session)) {
      await ctx.reply('Devi prima autenticarti. Usa /start');
      return;
    }
    const { createMainMenuKeyboard } = await import('./keyboards');
    await ctx.reply('Menu principale:', {
      reply_markup: createMainMenuKeyboard(),
    });
  });

  // Contact handler (for phone verification)
  bot.on(':contact', handleContact);

  // Callback queries (inline keyboard buttons)
  bot.on('callback_query:data', handleCallback);

  // Voice messages (transcribe and process as chat)
  bot.on('message:voice', handleVoiceMessage);

  // Text messages (for AI chat, phone number, or OTP code)
  bot.on('message:text', async (ctx) => {
    // Skip if it's a command
    if (ctx.message.text.startsWith('/')) return;

    const text = ctx.message.text.trim();

    // Check if waiting for OTP code
    if (ctx.session.pendingOtp) {
      const otpRegex = /^\d{6}$/;
      if (otpRegex.test(text)) {
        const { handleOtpCode } = await import('./handlers/start');
        await handleOtpCode(ctx, text);
        return;
      } else {
        await ctx.reply('Per favore inserisci il codice a 6 cifre che hai ricevuto via email.');
        return;
      }
    }

    // Check if it looks like a phone number (for manual entry)
    const phoneRegex = /^(\+?39)?[\s]?3\d{8,9}$/;
    if (!isAuthenticated(ctx.session) && phoneRegex.test(text.replace(/[\s\-]/g, ''))) {
      // Handle as phone number
      const { handlePhoneText } = await import('./handlers/start');
      await handlePhoneText(ctx, text);
      return;
    }

    // If authenticated, process as chat message
    if (isAuthenticated(ctx.session)) {
      await handleChatMessage(ctx, ctx.message.text);
    } else {
      await ctx.reply('Usa /start per iniziare e condividi il tuo numero di telefono.');
    }
  });

  return bot;
}
