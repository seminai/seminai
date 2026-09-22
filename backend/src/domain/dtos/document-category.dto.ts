import { DocumentCategory } from '@prisma/client';

export interface DocumentCategoryMeta {
  readonly category: DocumentCategory;
  readonly labelIt: string;
  readonly description: string;
  readonly color: string;
}

const DOCUMENT_CATEGORY_META: Readonly<Record<DocumentCategory, DocumentCategoryMeta>> = {
  DDT: {
    category: 'DDT',
    labelIt: 'DDT',
    description:
      'Documento di trasporto: identifica spedizione di merci con causale, vettore, righe prodotto.',
    color: 'blue',
  },
  DISCIPLINARE: {
    category: 'DISCIPLINARE',
    labelIt: 'Disciplinare',
    description:
      'Disciplinare di produzione integrata o biologica con norme tecniche, principi attivi consentiti, dosaggi.',
    color: 'emerald',
  },
  FASCICOLO_AZIENDALE: {
    category: 'FASCICOLO_AZIENDALE',
    labelIt: 'Fascicolo Aziendale',
    description:
      'Fascicolo aziendale AGEA/Regione: dati anagrafici, particelle catastali, conduzioni.',
    color: 'amber',
  },
  FATTURA: {
    category: 'FATTURA',
    labelIt: 'Fattura',
    description:
      'Fattura di acquisto/vendita con numero, data, fornitore, importi, righe prodotto.',
    color: 'violet',
  },
  MAGAZZINO: {
    category: 'MAGAZZINO',
    labelIt: 'Magazzino',
    description: 'Registro o report di carico/scarico magazzino, giacenze, movimentazioni interne.',
    color: 'cyan',
  },
  ETICHETTA: {
    category: 'ETICHETTA',
    labelIt: 'Etichetta',
    description:
      'Etichetta di fitofarmaco o fertilizzante: principio attivo, registrazione ministeriale, dosi, avvertenze.',
    color: 'rose',
  },
  VISURA_AZIENDALE: {
    category: 'VISURA_AZIENDALE',
    labelIt: 'Visura Aziendale',
    description:
      "Visura camerale o catastale dell'azienda agricola: ragione sociale, codice fiscale, sede.",
    color: 'slate',
  },
  NOTA: {
    category: 'NOTA',
    labelIt: 'Nota',
    description: 'Nota di campo, appunto manuale o promemoria operativo non strutturato.',
    color: 'gray',
  },
  PIANO_COLTURALE: {
    category: 'PIANO_COLTURALE',
    labelIt: 'Piano Colturale',
    description:
      'Piano colturale grafico (PCG) o tabellare con colture per particella e superfici.',
    color: 'lime',
  },
  CERTIFICAZIONE: {
    category: 'CERTIFICAZIONE',
    labelIt: 'Certificazione',
    description: 'Certificato di conformità (bio, GlobalGAP, IGP, DOP) rilasciato da ente terzo.',
    color: 'green',
  },
  ALTRO: {
    category: 'ALTRO',
    labelIt: 'Altro',
    description: 'Documento non riconducibile alle altre categorie o classificazione incerta.',
    color: 'zinc',
  },
};

export function getDocumentCategoryMeta(category: DocumentCategory): DocumentCategoryMeta {
  return DOCUMENT_CATEGORY_META[category];
}

export function listDocumentCategoryMeta(): readonly DocumentCategoryMeta[] {
  return Object.values(DOCUMENT_CATEGORY_META);
}

export const DOCUMENT_CATEGORY_VALUES: readonly DocumentCategory[] = [
  'DDT',
  'DISCIPLINARE',
  'FASCICOLO_AZIENDALE',
  'FATTURA',
  'MAGAZZINO',
  'ETICHETTA',
  'VISURA_AZIENDALE',
  'NOTA',
  'PIANO_COLTURALE',
  'CERTIFICAZIONE',
  'ALTRO',
] as const;
