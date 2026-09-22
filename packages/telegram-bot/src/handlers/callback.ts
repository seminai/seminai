import { BotContext } from '../types';
import { handleLogout } from './start';
import {
  handleCompanies,
  handleCompanySelect,
  handleCompanyFields,
  handleCompanyWarehouses,
} from './companies';
import { handleChatStart, handleChatApprove, handleChatReject, handleNewChat } from './chat';
import { createMainMenuKeyboard } from '../keyboards';
import { isAuthenticated } from '../session';

export async function handleCallback(ctx: BotContext): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  await ctx.answerCallbackQuery();

  const [action, ...params] = data.split(':');

  switch (action) {
    case 'menu':
      await handleMenuCallback(ctx, params[0]);
      break;

    case 'company':
      await handleCompanyCallback(ctx, params);
      break;

    case 'chat':
      await handleChatCallback(ctx, params[0]);
      break;

    case 'field':
    case 'warehouse':
      // For now, just acknowledge
      await ctx.answerCallbackQuery('Dettaglio non ancora implementato');
      break;

    default:
      console.log('Unknown callback:', data);
  }
}

async function handleMenuCallback(ctx: BotContext, action: string): Promise<void> {
  switch (action) {
    case 'main':
      if (!isAuthenticated(ctx.session)) {
        await ctx.editMessageText('Sessione scaduta. Usa /start per accedere.');
        return;
      }
      await ctx.editMessageText(`Ciao ${ctx.session.userName || 'utente'}! Cosa vuoi fare?`, {
        reply_markup: createMainMenuKeyboard(),
      });
      break;

    case 'companies':
      await handleCompanies(ctx);
      break;

    case 'chat':
      await handleChatStart(ctx);
      break;

    case 'account':
      if (!isAuthenticated(ctx.session)) {
        await ctx.editMessageText('Sessione scaduta. Usa /start');
        return;
      }
      await ctx.editMessageText(
        `Info Account:\n\n` +
          `Nome: ${ctx.session.userName || 'N/A'}\n` +
          `ID: ${ctx.session.userId || 'N/A'}`,
        { reply_markup: createMainMenuKeyboard() },
      );
      break;

    case 'logout':
      await handleLogout(ctx);
      break;

    default:
      console.log('Unknown menu action:', action);
  }
}

async function handleCompanyCallback(ctx: BotContext, params: string[]): Promise<void> {
  const [companyId, action] = params;

  if (!companyId) return;

  switch (action) {
    case 'fields':
      await handleCompanyFields(ctx, companyId);
      break;

    case 'warehouses':
      await handleCompanyWarehouses(ctx, companyId);
      break;

    case 'back':
      // Go back to company detail
      await ctx.editMessageText(
        `Azienda: ${ctx.session.selectedCompanyName || 'Selezionata'}\n\nCosa vuoi vedere?`,
        {
          reply_markup: (await import('../keyboards')).createCompanyDetailKeyboard(companyId),
        },
      );
      break;

    case 'select':
      // Look up company name from cache
      const companyName = ctx.session.companiesCache?.[companyId] || 'Azienda';
      await handleCompanySelect(ctx, companyId, companyName);
      break;

    default:
      console.log('Unknown company action:', action);
      break;
  }
}

async function handleChatCallback(ctx: BotContext, action: string): Promise<void> {
  switch (action) {
    case 'approve':
      await handleChatApprove(ctx);
      break;

    case 'reject':
      await handleChatReject(ctx);
      break;

    case 'new':
      await handleNewChat(ctx);
      break;

    default:
      console.log('Unknown chat action:', action);
  }
}
