/**
 * Known header patterns that indicate the start of a header row
 * These are distinctive enough to identify header rows vs metadata rows
 * NOTE: These patterns must appear in actual header context, not as metadata labels
 */
export const HEADER_INDICATORS = [
  // Piemonte format - specific patterns
  'unita produttiva',
  "unita' produttiva",
  'identificativo catastale',
  'occupazione suolo uso suolo primario',
  'uso del suolo primario',
  // Lombardia format - but not 'cuaa' alone (it appears in metadata)
  'supero',
  'tipo utilizzo',
  'coltivazione',
  'sez cens',
  'mappale',
  // Emilia-Romagna format
  'id. domanda',
  'occupazione suolo',
  // Common across formats - but need context (multiple columns)
  'superficie catastale',
  'superficie grafica',
  // Veneto AVEPA "Piano Utilizzo" format
  'sup. catastale',
  '1a coltura',
  'sup. utilizzata',
  'parcella di rif',
  'potenz. irriguo',
  // CIA Schedario Viticolo format
  'descrizione vitigno',
  'forma allevamento',
  'sup. vitata dichiarata',
  'codice vitigno',
  'numero ceppi',
];

/**
 * Known sub-header patterns that indicate continuation of a multi-row header
 */
export const SUB_HEADER_INDICATORS = [
  'istat',
  'descrizione',
  'sz.',
  'fgl.',
  'part.',
  'sub.',
  't.c.',
  'occ. suolo',
  'destinazione',
  'uso',
  "qualita'",
  "varieta'",
  'epoca',
  'tipo',
  'data inizio',
  'data fine',
];

/**
 * Column name mappings from abbreviated/variant names to standard names
 */
export const COLUMN_NAME_MAPPINGS: Record<string, string> = {
  // Piemonte abbreviations (standalone)
  "unita'\nproduttiva": 'Unita produttiva',
  "unita'\r\nproduttiva": 'Unita produttiva',
  "unita' produttiva": 'Unita produttiva',
  'sz.': 'Sezione',
  'fgl.': 'Foglio',
  'part.': 'Particella',
  'sub.': 'Subalterno',
  // Piemonte combined headers (identificativo catastale + sub-header)
  'identificativo catastale comune istat': 'Comune Istat',
  'identificativo catastale comune descrizione': 'Comune Descrizione',
  'identificativo catastale sz.': 'Sezione',
  'identificativo catastale fgl.': 'Foglio',
  'identificativo catastale part.': 'Particella',
  'identificativo catastale sub.': 'Subalterno',
  'sup.\ncat.': 'Superficie Catastale',
  'sup.\r\ncat.': 'Superficie Catastale',
  'sup. cat.': 'Superficie Catastale',
  'sup.\ngraf.': 'Superficie Grafica',
  'sup.\r\ngraf.': 'Superficie Grafica',
  'sup. graf.': 'Superficie Grafica',
  'sup.\nagr.': 'Superficie Agricola',
  'sup.\r\nagr.': 'Superficie Agricola',
  'sup. agr.': 'Superficie Agricola',
  'sup.\neleg.': 'Superficie Eleggibile',
  'sup.\r\neleg.': 'Superficie Eleggibile',
  'sup. eleg.': 'Superficie Eleggibile',
  'sup.\neleg.\nnetta': 'Superficie Eleggibile Netta',
  'sup.\r\neleg.\r\nnetta': 'Superficie Eleggibile Netta',
  'sup. eleg. netta': 'Superficie Eleggibile Netta',
  't.c.': 'Conduzione TC',
  'conduzione t.c.': 'Conduzione TC',
  '%': 'Conduzione Percent',
  'conduzione %': 'Conduzione Percent',
  'c.p.': 'CP',
  'irr.': 'Irr',
  'occ. suolo': 'Occupazione Suolo',
  "qualita'": 'Qualita',
  "varieta'": 'Varieta',
  'sup.': 'Superficie',
  'sup.\nnetta': 'Superficie Netta',
  'sup.\r\nnetta': 'Superficie Netta',
  'data inizio': 'Data inizio',
  'data fine': 'Data fine',
  'zona\nalt.': 'Zona Alt',
  'zona\r\nalt.': 'Zona Alt',
  "potenzialita'\nirrigua": 'Potenzialita irrigua',
  "potenzialita'\r\nirrigua": 'Potenzialita irrigua',
  'rotazione\ncolturale': 'Rotazione colturale',
  'rotazione\r\ncolturale': 'Rotazione colturale',
  'num.\npiante': 'Num piante',
  'num.\r\npiante': 'Num piante',
  'in\nconver.': 'In conversione',
  'in\r\nconver.': 'In conversione',
  'd.i.': 'Deroga iniziale',
  'd.f.': 'Deroga finale',
  bio: 'Bio Biologico',
  'conv.': 'Convenzionale Biologico',
  'az. cond. asservimento': 'Az cond asservimento',
  'zvn vigenti': 'Zona Vulnerabile Nitrati vigenti',
  "unita' di misura": 'Unita di misura',
  // Comune variants
  'comune istat': 'Comune Istat',
  'comune descrizione': 'Comune Descrizione',
  istat: 'Comune Istat',
  descrizione: 'Comune Descrizione',
};

/**
 * Result of header detection
 */
export interface HeaderDetectionResult {
  /** Normalized headers */
  headers: string[];
  /** Row index where data starts (0-based) */
  dataStartRow: number;
  /** Row index where headers start (0-based) */
  headerStartRow: number;
  /** Number of header rows detected */
  headerRowCount: number;
  /** Detected format type */
  detectedFormat:
    | 'piemonte'
    | 'lombardia'
    | 'emilia_romagna'
    | 'veneto'
    | 'veneto_avepa'
    | 'cia_schedario_viticolo'
    | 'unknown';
  /** Raw data rows (excluding headers and metadata) */
  rawRows: string[][];
  /** Metadata extracted from file (e.g., CUAA, Denominazione) */
  metadata: Record<string, string>;
}
