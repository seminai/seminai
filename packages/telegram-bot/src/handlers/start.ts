import { BotContext } from '../types';
import { seminaiClient } from '../api/SeminaiClient';
import { isAuthenticated, clearSession } from '../session';
import { createContactKeyboard, createMainMenuKeyboard } from '../keyboards';

export async function handleStart(ctx: BotContext): Promise<void> {
  console.log('[handleStart] Called, session:', JSON.stringify(ctx.session));

  if (isAuthenticated(ctx.session)) {
    console.log('[handleStart] User authenticated, showing menu');
    await ctx.reply(`Bentornato ${ctx.session.userName || 'utente'}! Cosa vuoi fare?`, {
      reply_markup: createMainMenuKeyboard(),
    });
    return;
  }

  // Clear any pending OTP state
  ctx.session.pendingPhone = undefined;
  ctx.session.pendingOtp = false;
  ctx.session.userEmail = undefined;

  console.log('[handleStart] User not authenticated, requesting contact');
  await ctx.reply(
    'Benvenuto in SeminAI!\n\n' +
      'Per iniziare, condividi il tuo numero di telefono per verificare il tuo account.',
    { reply_markup: createContactKeyboard() },
  );
}

export async function handleContact(ctx: BotContext): Promise<void> {
  console.log('[handleContact] Called');
  const contact = ctx.message?.contact;
  console.log('[handleContact] Contact:', JSON.stringify(contact));

  if (!contact?.phone_number) {
    console.log('[handleContact] No phone number');
    await ctx.reply('Non ho ricevuto il numero di telefono. Riprova con /start');
    return;
  }

  // Security: verify contact belongs to sender
  if (contact.user_id !== ctx.from?.id) {
    console.log('[handleContact] Contact user_id mismatch');
    await ctx.reply('Puoi condividere solo il tuo numero di telefono.');
    return;
  }

  const phoneNumber = contact.phone_number.startsWith('+')
    ? contact.phone_number
    : `+${contact.phone_number}`;

  await processPhoneVerification(ctx, phoneNumber);
}

export async function handlePhoneText(ctx: BotContext, text: string): Promise<void> {
  console.log('[handlePhoneText] Processing phone text:', text);

  // Normalize phone number
  let phoneNumber = text.replace(/[\s\-\(\)]/g, '');
  if (!phoneNumber.startsWith('+')) {
    phoneNumber = '+39' + phoneNumber.replace(/^39/, '');
  }

  await processPhoneVerification(ctx, phoneNumber);
}

async function processPhoneVerification(ctx: BotContext, phoneNumber: string): Promise<void> {
  console.log('[processPhoneVerification] Phone:', phoneNumber);
  await ctx.reply('Verifico il tuo numero...', { reply_markup: { remove_keyboard: true } });

  try {
    console.log('[processPhoneVerification] Calling verifyPhone API...');
    const verifyResult = await seminaiClient.verifyPhone(phoneNumber);
    console.log('[processPhoneVerification] verifyPhone result:', JSON.stringify(verifyResult));

    if (!verifyResult.exists) {
      console.log('[processPhoneVerification] Phone not found');
      await ctx.reply(
        'Il tuo numero di telefono non è associato a nessun account SeminAI.\n\n' +
          'Registrati su seminai.it o contatta il supporto per associare il tuo numero.',
      );
      return;
    }

    // Send OTP email
    console.log('[processPhoneVerification] Phone exists, sending OTP...');
    const otpResult = await seminaiClient.sendOtp(phoneNumber, ctx.from!.id);
    console.log('[processPhoneVerification] sendOtp result:', JSON.stringify(otpResult));

    if (!otpResult.sent) {
      await ctx.reply("Errore nell'invio del codice di verifica. Riprova con /start");
      return;
    }

    // Save pending state
    ctx.session.pendingPhone = phoneNumber;
    ctx.session.pendingOtp = true;
    ctx.session.userEmail = otpResult.maskedEmail;

    await ctx.reply(
      `📧 Ti ho inviato un codice di verifica a ${otpResult.maskedEmail}\n\n` +
        'Inserisci il codice a 6 cifre che hai ricevuto:',
    );
  } catch (error) {
    console.error('[processPhoneVerification] ERROR:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await ctx.reply(`Si è verificato un errore: ${errorMessage}\n\nRiprova con /start`);
  }
}

export async function handleOtpCode(ctx: BotContext, code: string): Promise<void> {
  console.log('[handleOtpCode] Verifying OTP:', code);

  if (!ctx.session.pendingPhone || !ctx.session.pendingOtp) {
    await ctx.reply('Sessione scaduta. Riprova con /start');
    return;
  }

  try {
    const result = await seminaiClient.verifyOtp(
      ctx.session.pendingPhone,
      code,
      ctx.from!.id,
      ctx.from?.username,
    );

    // Clear pending state and set authenticated state
    ctx.session.pendingPhone = undefined;
    ctx.session.pendingOtp = false;
    ctx.session.userEmail = undefined;
    ctx.session.token = result.token;
    ctx.session.userId = result.user.id;
    ctx.session.userName = result.user.name;
    ctx.session.lastActivity = Date.now();

    await ctx.reply(
      `✅ Ciao ${result.user.name}! Autenticazione completata.\n\n` + 'Cosa vuoi fare?',
      {
        reply_markup: createMainMenuKeyboard(),
      },
    );
  } catch (error) {
    console.error('OTP verification error:', error);
    await ctx.reply(
      '❌ Codice non valido o scaduto.\n\n' +
        'Inserisci il codice corretto oppure usa /start per ricominciare.',
    );
  }
}

export async function handleLogout(ctx: BotContext): Promise<void> {
  clearSession(ctx.session);
  await ctx.reply('Sei stato disconnesso. Usa /start per accedere di nuovo.', {
    reply_markup: { remove_keyboard: true },
  });
}
