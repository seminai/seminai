import { InlineKeyboard, Keyboard } from 'grammy';
import { Company, Field, Warehouse } from '../types';

export function createContactKeyboard(): Keyboard {
  return new Keyboard().requestContact('Condividi il tuo numero di telefono').resized().oneTime();
}

export function createMainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🏢 Le mie aziende', 'menu:companies')
    .row()
    .text('💬 Chat SeminAI', 'menu:chat')
    .row()
    .text('ℹ️ Info account', 'menu:account')
    .row()
    .text('🚪 Esci', 'menu:logout');
}

export function createCompaniesKeyboard(companies: Company[]): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const company of companies.slice(0, 10)) {
    // Use only ID in callback data to avoid exceeding Telegram's 64-byte limit
    const truncatedName =
      company.name.length > 30 ? company.name.substring(0, 27) + '...' : company.name;
    keyboard.text(truncatedName, `company:${company.id}:select`).row();
  }

  keyboard.text('< Menu principale', 'menu:main');

  return keyboard;
}

export function createCompanyDetailKeyboard(companyId: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('Campi', `company:${companyId}:fields`)
    .text('Magazzini', `company:${companyId}:warehouses`)
    .row()
    .text('< Torna alle aziende', 'menu:companies');
}

export function createFieldsKeyboard(fields: Field[], companyId: string): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const field of fields.slice(0, 10)) {
    const label = field.gisHa ? `${field.name} (${field.gisHa.toFixed(2)} ha)` : field.name;
    keyboard.text(label, `field:${field.id}`).row();
  }

  keyboard.text("< Torna all'azienda", `company:${companyId}:back`);

  return keyboard;
}

export function createWarehousesKeyboard(
  warehouses: Warehouse[],
  companyId: string,
): InlineKeyboard {
  const keyboard = new InlineKeyboard();

  for (const warehouse of warehouses.slice(0, 10)) {
    keyboard.text(warehouse.name, `warehouse:${warehouse.id}`).row();
  }

  keyboard.text("< Torna all'azienda", `company:${companyId}:back`);

  return keyboard;
}

export function createBackToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('< Menu principale', 'menu:main');
}

export function createApprovalKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('Approva', 'chat:approve').text('Rifiuta', 'chat:reject');
}

export function createChatMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('Nuova conversazione', 'chat:new')
    .row()
    .text('< Menu principale', 'menu:main');
}
