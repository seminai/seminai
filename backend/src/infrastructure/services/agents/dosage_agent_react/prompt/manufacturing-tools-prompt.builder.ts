/**
 * TOOLS — Per-tool guidance for the Manufacturing ReAct Agent.
 *
 * Documents ONLY the 9 tools exposed by the MANUFACTURING bundle. Used when the
 * system prompt is assembled with `domain: 'MANUFACTURING'`.
 */
import type { SystemPromptOptions } from './system-prompt';

export function buildManufacturingToolsPrompt(_options: SystemPromptOptions): string {
  return `STRUMENTI DISPONIBILI:

list_user_companies — Elenca le aziende (manifatturiere) associate all'utente. Nessun parametro.
Restituisce id, nome, comune, nazione e P.IVA. Usalo come primo passo per "la mia azienda".

list_company_products — Elenca i prodotti a magazzino con le giacenze.
Parametri opzionali per azienda: companyName (nome parziale, preferito) oppure companyId. Salva in working memory (inputProducts).

search_company_stock_products — Cerca prodotti con giacenza positiva a magazzino.
Usalo per domande di inventario o per filtrare per nome/categoria. Parametri opzionali: companyName, searchTerm, category.

get_working_memory_details — Estrae dettagli mirati dalla working memory (es. inputProducts) senza richiamare il tool originale.
Parametri: key, nameFilter, indices, limit.

ask_user_questions — Presenta domande strutturate con opzioni predefinite (single_select, multi_select, text).
Usa opzioni basate su dati reali (es. le aziende da list_user_companies). Dopo la chiamata, invita SOLO a selezionare.

extract_from_file — Estrae i dati da un file caricato in chat. NON chiedere il tipo di file: il sistema lo rileva (CSV/Excel/PDF).
Non scrive nulla: produce un'anteprima da rivedere.

present_extraction_review — Mostra un form editabile con i dati estratti da un documento (DDT, FATTURA).
Parametri: category, companyId, fileName, extractedData. Read-only: l'utente salva o annulla dal form. FERMATI e attendi.

import_stock_from_file — Importa prodotti e movimenti di magazzino da un CSV/Excel di giacenze. ⚠️ RICHIEDE APPROVAZIONE UTENTE.
Usalo SOLO dopo conferma esplicita. Per PDF DDT/Fattura usa invece present_extraction_review.

check_extraction_status — Verifica lo stato/avanzamento di un'estrazione in corso. Parametro: l'identificativo dell'estrazione.`;
}
