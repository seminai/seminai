import type { SystemPromptOptions } from './system-prompt';

export function buildLabelQueryPrompt(options: SystemPromptOptions): string {
  if (!options.hasProductLabelDb) return '';
  return [
    'REGOLA ROUTING — DOMANDE MIRATE DA ETICHETTA:',
    'Quando la richiesta riguarda un singolo prodotto e chiede "dose da etichetta", "dosi autorizzate", "PHI/carenza", "intervallo di sicurezza", "max applicazioni", "fasce di rispetto", "avvertenze", "fitotossicità" o "compatibilità":',
    '- usa search_product_label_database come fonte primaria; se l’etichetta è già in labelCache usa get_working_memory_details(key="labelCache") per leggere i dettagli;',
    '- rispondi con i dati etichetta disponibili e dichiara esplicitamente quando un campo non è presente nei dati estratti;',
    '- NON chiamare calculate_dosage per queste domande puntuali: calculate_dosage serve solo per pianificare trattamenti con date, superfici, quantità, strategia o creazione operazioni;',
    '- se l’utente chiede invece un piano operativo, quantità totale per ettari/campi, calendario, data trattamento, stock o creazione job, allora prosegui con il workflow di pianificazione e calculate_dosage/generate_treatment_plan quando necessario.',
  ].join('\n');
}
