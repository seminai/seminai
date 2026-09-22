export type ChatQuickActionId =
  | 'upload_documents'
  | 'treatment_plan'
  | 'chat_with_data'
  | 'write_to_colleague'
  | 'create_rules';

export interface ChatQuickAction {
  readonly id: ChatQuickActionId;
  readonly label: string;
  readonly prompt: string;
  readonly openFilePicker?: boolean;
}

export const CHAT_QUICK_ACTIONS: readonly ChatQuickAction[] = [
  {
    id: 'upload_documents',
    label: 'Carica documenti',
    openFilePicker: true,
    prompt:
      'Ti allego dei documenti. Estrai i dati in anteprima, spiegami cosa hai riconosciuto e chiedimi conferma prima di importare qualsiasi informazione.',
  },
  {
    id: 'treatment_plan',
    label: 'Piano trattamenti',
    prompt:
      'Voglio costruire un piano trattamenti pratico e verificabile. Procedi per step: strategia, dosaggi, controlli di conformita e disponibilita prodotti, poi mostrarmi un piano chiaro da approvare.',
  },
  {
    id: 'chat_with_data',
    label: 'Chatta con i dati',
    prompt:
      'Analizza il contesto disponibile (aziende, campi, prodotti, storico e regole) e rispondi in modo operativo: prima una sintesi, poi azioni consigliate.',
  },
  {
    id: 'write_to_colleague',
    label: 'Scrivi a collega',
    prompt:
      'Ti descrivo una nota operativa da inoltrare a un collega di campo. Trasforma il contenuto in un riepilogo professionale e chiedimi conferma finale prima di procedere.',
  },
  {
    id: 'create_rules',
    label: 'Crea regole',
    prompt:
      'Aiutami a creare una nuova regola workspace chiara e applicabile. Mostra prima bozza, condizioni, eccezioni e impatto atteso, poi chiedi conferma.',
  },
] as const;
