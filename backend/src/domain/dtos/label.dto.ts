export interface LabelTextResult {
  readonly text: string;
  readonly url: string;
  readonly usedMistralOcr?: boolean;
  readonly sourcePdfHash?: string;
  readonly rawTextHash?: string;
  readonly officialSourceUrl?: string;
}

export interface LabelDoseDetail {
  /** Crop name (e.g., Vite) */
  readonly coltura: string;
  /** Optional disease/pathogen (e.g., Oidio) */
  readonly malattia?: string | null;
  /** Minimum product dose (e.g., 1.0) - used when label specifies a range like 1-3 kg/ha */
  readonly dose_minima?: number | null;
  /** Maximum product dose (e.g., 3.0) - used when label specifies a range like 1-3 kg/ha */
  readonly dose_massima?: number | null;
  /** Unit of measure for dose (e.g., "L/ha", "kg/ha", "g/hl") */
  readonly dose_um?: string | null;
  /** Maximum water volume to dilute the product (numeric) */
  readonly acqua_max?: number | null;
  /** Unit of measure for water volume (e.g., "L/ha", "L/hl") */
  readonly acqua_max_um?: string | null;
  /** Max number of applications when specified */
  readonly n_max_applicazioni?: number | null;
  /** Unit of measure for max applications (e.g., "per anno", "per ciclo") */
  readonly n_max_applicazioni_um?: string | null;
  /** Minimum interval days between applications */
  readonly intervallo_min_giorni?: number | null;
  /** Pre-harvest interval days (PHI). Null when not applicable */
  readonly intervallo_sicurezza_giorni?: number | null;
  /** Short free-text on timing/BBCH/stage */
  readonly epoca_impiego?: string | null;
  /** Additional free-text application mode if present */
  readonly modalita_applicazione?: string | null;

  readonly istruzioni?: string | null;
}

export interface LabelResistance {
  /** Products or active ingredients to avoid (e.g., ["BELLIS Drupacee", "boscalid", "pyraclostrobin"]) */
  readonly prodotti_da_evitare?: string[] | null;
  /** Chemical families to avoid (e.g., ["carbossianilidi", "strobilurine"]) */
  readonly famiglie_chimiche_da_evitare?: string[] | null;
  /** Minimum number of applications allowed (used when range is specified, e.g., "1-2") */
  readonly n_min_applicazioni?: number | null;
  /** Maximum number of applications allowed */
  readonly n_max_applicazioni?: number | null;
  /** Unit of measure for applications (e.g., "per anno", "per ciclo") */
  readonly n_max_applicazioni_um?: string | null;
  /** Time period for the restriction (e.g., "nell'arco dell'anno", "per ciclo") */
  readonly periodo_tempo?: string | null;
  /** Crops affected by this resistance warning */
  readonly colture_interessate?: string[] | null;
  /** Recommendations for resistance management */
  readonly raccomandazioni?: string | null;
  /** Full text of the resistance section for reference */
  readonly testo_completo?: string | null;
}

export interface Label {
  /** Commercial product name */
  prodotto: string | null;
  /** Category/type, e.g., "Fungicida (SC)" */
  categoria: string | null;
  /** Optional formulation, e.g., "SC (sospensione concentrata)" */
  formulazione?: string | null;
  /** Active ingredient */
  principio_attivo: string | null;
  /** Composition string, e.g., "Zolfo puro 56.1% (800 g/L)" */
  composizione: string | null;
  /** FRAC or MoA code when present */
  meccanismo_azione_frac: string | null;
  /** Diseases/targets */
  malattie: string[];
  /** Species list */
  specie: string[];
  /** Target crops list */
  colture_target: string[];
  /** Crops for application outside production period (e.g., "TERRENI IN ASSENZA DI COLTURE e destinati alla coltivazione di:") */
  colture_target_fuori_periodo_di_prodizione?: string[] | null;
  /** Detailed per-crop dosing and timings */
  dosaggi_dettagliati: ReadonlyArray<LabelDoseDetail>;
  /** Buffer strips / drift mitigation text lines */
  fasce_di_rispetto_e_deriva: string[];
  /** Buffer zone from water bodies (rivers, canals, lakes, etc.) */
  fasce_rispetto_acqua?: string | null;
  /** Buffer zone from other crops (adjacent, sensitive, etc.) */
  fasce_rispetto_colture?: string | null;
  /** Warnings/precautions */
  avvertenze: string[];
  /** Hazard statements (EUH/H) */
  frasi_pericolo: string[];
  /** Precautionary statements (P) */
  frasi_prudenza: string[];
  /** Compatibility notes */
  compatibilita: string | null;
  /** Phytotoxicity notes */
  fitotossicita: string | null;
  /** Generic technical notes */
  note_tecniche: string | null;
  /** Resistance management information */
  resistenze?: ReadonlyArray<LabelResistance>;
  /** Confidence (0-100) */
  extraction_confidence: number;
  /** Names of fields successfully extracted */
  extracted_fields: string[];
  /** Any extraction errors */
  errors: string[];
  /** Optional: product metadata */
  numero_registrazione?: string | null;
  titolare?: string | null;
  stabilimento?: string | null;
  caratteristiche?: string | null;
}

export interface LabelWithQuality extends Label {
  qualityExtraction: number[];
}

export function isFitoLabel(obj: unknown): obj is Label {
  const candidate = obj as Label;
  return (
    typeof candidate === 'object' &&
    candidate !== null &&
    Array.isArray(candidate.colture_target) &&
    Array.isArray(candidate.dosaggi_dettagliati)
  );
}

/**
 * Returns true when the label carries meaningful extracted content.
 * A label produced by `sanitizeLabel({})` (empty arrays, confidence 0)
 * will return false, preventing it from being served from cache.
 */
export function isUsableLabel(obj: unknown): boolean {
  if (!isFitoLabel(obj)) return false;
  return (
    obj.dosaggi_dettagliati.length > 0 ||
    obj.colture_target.length > 0 ||
    (obj.extraction_confidence ?? 0) > 10
  );
}
