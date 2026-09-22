import { BotContext } from '../types';
import { seminaiClient } from '../api/SeminaiClient';
import { isAuthenticated } from '../session';
import {
  createMainMenuKeyboard,
  createCompaniesKeyboard,
  createCompanyDetailKeyboard,
  createFieldsKeyboard,
  createWarehousesKeyboard,
} from '../keyboards';

export async function handleCompanies(ctx: BotContext): Promise<void> {
  if (!isAuthenticated(ctx.session)) {
    await ctx.reply('Devi prima autenticarti. Usa /start');
    return;
  }

  try {
    const companies = await seminaiClient.getCompanies(ctx.session.token!);

    if (companies.length === 0) {
      await ctx.editMessageText('Non hai aziende associate al tuo account.', {
        reply_markup: createMainMenuKeyboard(),
      });
      return;
    }

    // Cache company names in session for later lookup
    ctx.session.companiesCache = {};
    for (const company of companies) {
      ctx.session.companiesCache[company.id] = company.name;
    }

    await ctx.editMessageText("Seleziona un'azienda:", {
      reply_markup: createCompaniesKeyboard(companies),
    });
  } catch (error) {
    console.error('Error fetching companies:', error);
    await ctx.editMessageText('Errore nel recupero delle aziende. Riprova.', {
      reply_markup: createMainMenuKeyboard(),
    });
  }
}

export async function handleCompanySelect(
  ctx: BotContext,
  companyId: string,
  companyName: string,
): Promise<void> {
  if (!isAuthenticated(ctx.session)) {
    await ctx.answerCallbackQuery('Sessione scaduta. Usa /start');
    return;
  }

  ctx.session.selectedCompanyId = companyId;
  ctx.session.selectedCompanyName = companyName;

  await ctx.editMessageText(`Azienda: ${companyName}\n\nCosa vuoi vedere?`, {
    reply_markup: createCompanyDetailKeyboard(companyId),
  });
}

export async function handleCompanyFields(ctx: BotContext, companyId: string): Promise<void> {
  if (!isAuthenticated(ctx.session)) {
    await ctx.answerCallbackQuery('Sessione scaduta. Usa /start');
    return;
  }

  try {
    const fields = await seminaiClient.getFieldsByCompany(ctx.session.token!, companyId);

    if (fields.length === 0) {
      await ctx.editMessageText(`Nessun campo trovato per questa azienda.`, {
        reply_markup: createCompanyDetailKeyboard(companyId),
      });
      return;
    }

    let message = `Campi (${fields.length}):\n\n`;
    for (const field of fields.slice(0, 10)) {
      const area = field.gisHa ? ` - ${field.gisHa.toFixed(2)} ha` : '';
      const location = field.city ? ` (${field.city})` : '';
      message += `- ${field.name}${area}${location}\n`;
    }

    if (fields.length > 10) {
      message += `\n... e altri ${fields.length - 10} campi`;
    }

    await ctx.editMessageText(message, {
      reply_markup: createFieldsKeyboard(fields, companyId),
    });
  } catch (error) {
    console.error('Error fetching fields:', error);
    await ctx.editMessageText('Errore nel recupero dei campi. Riprova.', {
      reply_markup: createCompanyDetailKeyboard(companyId),
    });
  }
}

export async function handleCompanyWarehouses(ctx: BotContext, companyId: string): Promise<void> {
  if (!isAuthenticated(ctx.session)) {
    await ctx.answerCallbackQuery('Sessione scaduta. Usa /start');
    return;
  }

  try {
    const warehouses = await seminaiClient.getWarehousesByCompany(ctx.session.token!, companyId);

    if (warehouses.length === 0) {
      await ctx.editMessageText(`Nessun magazzino trovato per questa azienda.`, {
        reply_markup: createCompanyDetailKeyboard(companyId),
      });
      return;
    }

    let message = `Magazzini (${warehouses.length}):\n\n`;
    for (const warehouse of warehouses) {
      const location = warehouse.city ? ` (${warehouse.city})` : '';
      message += `- ${warehouse.name}${location}\n`;
    }

    await ctx.editMessageText(message, {
      reply_markup: createWarehousesKeyboard(warehouses, companyId),
    });
  } catch (error) {
    console.error('Error fetching warehouses:', error);
    await ctx.editMessageText('Errore nel recupero dei magazzini. Riprova.', {
      reply_markup: createCompanyDetailKeyboard(companyId),
    });
  }
}
