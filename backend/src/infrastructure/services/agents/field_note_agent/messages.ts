/**
 * User-facing messages for the Field Note Agent.
 * Centralized to avoid hardcoded strings scattered across the codebase.
 */

export const FIELD_NOTE_MESSAGES = {
  // Approval prompts
  CONFIRM_SAVE: (category: string, rawContent: string) =>
    `Confermi di voler salvare questa ${category}?\n\n` + `📝 Contenuto: "${rawContent}"`,

  CONFIRM_SAVE_WITH_DETAILS: (params: {
    category: string;
    rawContent: string;
    fieldId?: string;
    fieldName?: string;
    productionUnitId?: string;
    productionUnitName?: string;
    productId?: string;
    productName?: string;
    quantity?: number;
    unitOfMeasure?: string;
  }) => {
    let message =
      `Confermi di voler salvare questa ${params.category || 'nota di campo'}?\n\n` +
      `📝 Contenuto: "${params.rawContent}"\n`;

    if (params.fieldName) {
      message += `🏭 Campo: ${params.fieldName}\n`;
    }
    if (params.productionUnitName) {
      message += `🌱 Unità Produttiva: ${params.productionUnitName}\n`;
    }
    if (params.productName) {
      message += `💊 Prodotto: ${params.productName}\n`;
    }
    if (params.quantity) {
      message += `📊 Quantità: ${params.quantity} ${params.unitOfMeasure || ''}\n`;
    }

    message += `\nClicca "Approva" per salvare o "Rifiuta" per modificare.`;
    return message;
  },

  CONFIRM_BULK_SAVE: (params: {
    count: number;
    category: string;
    rawContent: string;
    fieldNames: string[];
  }) =>
    `⚠️ ATTENZIONE: Stai per creare ${params.count} note di campo identiche!\n\n` +
    `📝 Contenuto: "${params.rawContent}"\n` +
    `📋 Categoria: ${params.category}\n\n` +
    `🏭 Campi interessati (${params.count}):\n` +
    params.fieldNames.map((name, i) => `   ${i + 1}. ${name}`).join('\n') +
    `\n\n✅ Clicca "Approva" per creare ${params.count} note separate o "Rifiuta" per modificare.`,

  // Tool execution
  TOOL_EXECUTION_REQUEST: (toolName: string) => `L'agente vuole eseguire: ${toolName}`,

  // Completion messages
  CONVERSATION_COMPLETED: 'Conversazione completata.',
  TOOL_EXECUTION_COMPLETED: 'Tool execution completata.',
  FEEDBACK_PROCESSED: 'Feedback processato.',

  // Error messages
  NO_COMPANIES_FOUND: (searchTerm?: string) =>
    "Nessuna azienda trovata per l'utente corrente" +
    (searchTerm ? ` con il termine di ricerca "${searchTerm}"` : ''),

  NO_FIELDS_FOUND: (searchTerm?: string, companyName?: string) =>
    "Nessun campo trovato per l'utente corrente" +
    (searchTerm ? ` con il termine di ricerca "${searchTerm}"` : '') +
    (companyName ? ` nell'azienda "${companyName}"` : ''),

  NO_PRODUCTION_UNITS_FOUND: (cropName?: string, companyName?: string) =>
    "Nessuna unità produttiva trovata per l'utente corrente" +
    (cropName ? ` con la coltura "${cropName}"` : '') +
    (companyName ? ` nell'azienda "${companyName}"` : ''),

  NO_PRODUCTS_FOUND: (searchTerm?: string, category?: string) =>
    "Nessun prodotto trovato per l'utente corrente" +
    (searchTerm ? ` con il termine di ricerca "${searchTerm}"` : '') +
    (category ? ` nella categoria ${category}` : ''),

  // Search fallback messages
  FIELDS_NO_MATCH_ALTERNATIVES: (searchTerm: string) =>
    `Nessun campo trovato con il nome "${searchTerm}", ma ecco tutti i campi disponibili nell'azienda:`,

  PRODUCTION_UNITS_NO_MATCH_ALTERNATIVES: (cropName: string) =>
    `Nessuna unità produttiva trovata con la coltura "${cropName}", ma ecco tutte le UP disponibili nell'azienda:`,

  // Tool errors
  CLASSIFICATION_FAILED: (error: string) => `Classificazione fallita: ${error}`,
  SEARCH_COMPANIES_FAILED: (error: string) => `Ricerca aziende fallita: ${error}`,
  SEARCH_FIELDS_FAILED: (error: string) => `Ricerca campi fallita: ${error}`,
  SEARCH_PRODUCTION_UNITS_FAILED: (error: string) => `Ricerca unità produttive fallita: ${error}`,
  SEARCH_PRODUCTS_FAILED: (error: string) => `Ricerca prodotti fallita: ${error}`,
  SAVE_FAILED: (error: string) => `Salvataggio fallito: ${error}`,
  STOCK_SAVE_FAILED: (error: string) => `Operazione magazzino fallita: ${error}`,
  GPS_EXTRACTION_FAILED: (error: string) => `Estrazione GPS fallita: ${error}`,

  // Warnings
  SAVE_WITHOUT_FIELD_WARNING:
    'Nota salvata SENZA campo associato (fieldId mancante). Si consiglia di associare sempre un campo.',
};

/**
 * Log prefixes for structured console logging.
 */
export const LOG_PREFIX = {
  HANDLER: '[FIELD-NOTE]',
  GRAPH: '[FIELD-NOTE-GRAPH]',
  TOOL_CLASSIFY: '[Tool:classify]',
  TOOL_FIND_COMPANIES: '[Tool:find_companies]',
  TOOL_FIND_FIELDS: '[Tool:find_fields]',
  TOOL_FIND_PU: '[Tool:find_pu]',
  TOOL_FIND_PRODUCTS: '[Tool:find_products]',
  TOOL_SAVE: '[Tool:save]',
  TOOL_BULK_SAVE: '[Tool:bulk_save]',
  TOOL_STOCK_IN_PURCHASE: '[Tool:stock_in_purchase]',
  TOOL_STOCK_IN_HARVEST: '[Tool:stock_in_harvest]',
  TOOL_STOCK_OUT_SALE: '[Tool:stock_out_sale]',
  TOOL_STOCK_OUT_TREATMENT: '[Tool:stock_out_treatment]',
  TOOL_BDF_CACHE: '[Tool:bdf_cache]',
  TOOL_BDF_SEARCH_CACHED: '[Tool:bdf_search_cached]',
  RESOLVE_COMPANY: '[resolveCompanyId]',
  TOOL_EXTRACT_GPS: '[Tool:extract_gps]',
  TOOL_COUNT_FIELD_NOTES: '[Tool:count_field_notes]',
  TOOL_LIST_FIELD_NOTES: '[Tool:list_field_notes]',
  TOOL_GET_FIELD_NOTE: '[Tool:get_field_note]',
};
