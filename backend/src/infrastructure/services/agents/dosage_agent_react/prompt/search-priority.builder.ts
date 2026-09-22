/**
 * Builds the ordered search-tool priority list shown in the system prompt.
 * Order reflects decreasing reliability: local rules → internal DB → BDF → web.
 */
import type { SystemPromptOptions } from './system-prompt';

export function buildSearchPriority(options: SystemPromptOptions): string {
  const items: string[] = [];
  let n = 1;

  if (options.hasRulesSearch) {
    items.push(
      `${n++}. search_rules — Con companyId cerca di default SOLO regole vettorizzate assegnate alla company. La ricerca workspace e' esplorativa e non vincolante. PRIORITÀ MASSIMA per domande su conformità.`,
    );
  }

  if (options.hasProductLabelDb) {
    items.push(
      `${n++}. search_product_label_database — Cerca etichette ministeriali COMPLETE nel database interno. ALTA PRIORITÀ per dati di etichetta: dosi, carenze, fasce di rispetto, resistenze, compatibilità, FRAC. Usa PRIMA di bdf_search_product_doses.`,
    );
  }

  if (options.hasDisciplinariPdf) {
    items.push(
      `${n++}. search_disciplinari_bdf_pdf — Cerca nei PDF ufficiali dei disciplinari regionali BDF (2024-2025). Alta priorità per dosi, max interventi, finestre fenologiche.`,
    );
  }

  items.push(
    `${n++}. search_disciplinari_database — Cerca dati strutturati estratti dai disciplinari regionali. Filtra per regione, anno, prodotto, coltura, avversità.`,
  );

  if (options.hasBdfTools) {
    items.push(
      `${n++}. bdf_search_product_doses — Cerca dosi ufficiali BDF per un prodotto su una coltura.`,
      `${n++}. bdf_search_products_by_adversity — Cerca prodotti autorizzati per una combinazione coltura/avversità.`,
    );
  }

  if (options.hasProductRecommendation) {
    items.push(
      `${n++}. recommend_best_products — Quando l'utente chiede "qual è il prodotto/principio attivo MIGLIORE per <avversità> su <coltura>": classifica i prodotti autorizzati per efficacia, rotazione FRAC, bio/carenza e disponibilità a magazzino. Risolve i dati prodotto con cascata BDF → etichette → (scraping). Usa al posto di bdf_search_products_by_adversity quando serve una RACCOMANDAZIONE ordinata.`,
    );
  }

  if (options.hasTavilySearch) {
    items.push(
      `${n}. tavily_scientific_search — Cerca su fonti ufficiali online. SOLO come fallback se le fonti locali sono insufficienti.`,
    );
  }

  return `STRUMENTI DI RICERCA — PRIORITÀ:\n${items.join('\n')}`;
}
