export const COLUMN_LABELS: Record<string, string> = {
  titolo: 'Titolo',
  azienda: 'Azienda',
  aggiornato: 'Aggiornato',
  status: 'Status',
  tipoDiFile: 'Tipo di file',
  formato: 'Formato',
  note: 'Note',
};

export const FILTER_CONDITIONS = [
  'Contiene',
  'Uguale a',
  'Inizia con',
  'Finisce con',
] as const;

export type FilterCondition = (typeof FILTER_CONDITIONS)[number];

export const STATUS_STYLES = {
  generato: 'bg-green-100 text-green-700 border-green-200',
  caricato: 'bg-gray-100 text-gray-700 border-gray-200',
  'da confermare': 'bg-yellow-50 text-yellow-700 border-yellow-300',
  'da verificare': 'bg-yellow-50 text-yellow-700 border-yellow-300',
  'in caricamento': 'bg-gray-50 text-gray-500 border-gray-300 border-dashed',
  inviato: 'bg-emerald-50 text-emerald-600 border-emerald-200',
  confermato: 'bg-green-100 text-green-700 border-green-200',
  errore: 'bg-red-50 text-red-600 border-red-200',
} as const;

export type StatusKey = keyof typeof STATUS_STYLES;
