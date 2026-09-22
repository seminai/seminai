import { Label, LabelResistance } from '../../../domain/dtos/label.dto';
import { coerceDosaggiDettagliati, coerceStringArray, deduplicatePreservingOrder, normalizeSpeciesName, parseRange, toOptionalNumber } from './cleanText.part-01-normalize-reg';

export function coerceResistenze(value: unknown): ReadonlyArray<LabelResistance> {
  if (!Array.isArray(value)) return [];
  const output: Array<LabelResistance> = [];
  for (const v of value) {
    const obj = typeof v === 'object' && v ? (v as Record<string, unknown>) : {};
    const prodotti_da_evitare =
      obj['prodotti_da_evitare'] === null ||
      (Array.isArray(obj['prodotti_da_evitare']) && obj['prodotti_da_evitare'].length === 0)
        ? null
        : coerceStringArray(obj['prodotti_da_evitare']);
    const famiglie_chimiche_da_evitare =
      obj['famiglie_chimiche_da_evitare'] === null ||
      (Array.isArray(obj['famiglie_chimiche_da_evitare']) &&
        obj['famiglie_chimiche_da_evitare'].length === 0)
        ? null
        : coerceStringArray(obj['famiglie_chimiche_da_evitare']);
    let n_min_applicazioni: number | null = null;
    let n_max_applicazioni: number | null = null;
    const n_min_raw = obj['n_min_applicazioni'];
    const n_max_raw = obj['n_max_applicazioni'];
    const n_applicazioni_raw = obj['n_applicazioni'];
    if (n_min_raw != null || n_max_raw != null) {
      if (typeof n_max_raw === 'string') {
        const range = parseRange(n_max_raw);
        n_min_applicazioni = range.min ?? toOptionalNumber(n_min_raw);
        n_max_applicazioni = range.max;
      } else {
        n_min_applicazioni = toOptionalNumber(n_min_raw);
        n_max_applicazioni = toOptionalNumber(n_max_raw);
        if (n_min_applicazioni == null && n_max_applicazioni != null) {
          n_min_applicazioni = n_max_applicazioni;
        }
      }
    } else if (n_applicazioni_raw != null) {
      const range = parseRange(n_applicazioni_raw);
      n_min_applicazioni = range.min;
      n_max_applicazioni = range.max;
    }
    const n_max_applicazioni_um =
      typeof obj['n_max_applicazioni_um'] === 'string' || obj['n_max_applicazioni_um'] === null
        ? (obj['n_max_applicazioni_um'] as string | null) ?? null
        : null;
    const periodo_tempo =
      typeof obj['periodo_tempo'] === 'string' || obj['periodo_tempo'] === null
        ? (obj['periodo_tempo'] as string | null) ?? null
        : null;
    const colture_interessate =
      obj['colture_interessate'] === null ||
      (Array.isArray(obj['colture_interessate']) && obj['colture_interessate'].length === 0)
        ? null
        : deduplicatePreservingOrder(
            coerceStringArray(obj['colture_interessate']).map(normalizeSpeciesName),
          );
    const raccomandazioni =
      typeof obj['raccomandazioni'] === 'string' || obj['raccomandazioni'] === null
        ? (obj['raccomandazioni'] as string | null) ?? null
        : null;
    const testo_completo =
      typeof obj['testo_completo'] === 'string' || obj['testo_completo'] === null
        ? (obj['testo_completo'] as string | null) ?? null
        : null;
    if (
      (!prodotti_da_evitare || prodotti_da_evitare.length === 0) &&
      (!famiglie_chimiche_da_evitare || famiglie_chimiche_da_evitare.length === 0) &&
      n_min_applicazioni == null &&
      n_max_applicazioni == null &&
      !n_max_applicazioni_um &&
      !periodo_tempo &&
      (!colture_interessate || colture_interessate.length === 0) &&
      !raccomandazioni &&
      !testo_completo
    ) {
      continue;
    }
    const resistance: LabelResistance = {
      ...(prodotti_da_evitare && prodotti_da_evitare.length > 0 && { prodotti_da_evitare }),
      ...(famiglie_chimiche_da_evitare &&
        famiglie_chimiche_da_evitare.length > 0 && { famiglie_chimiche_da_evitare }),
      ...(n_min_applicazioni != null && { n_min_applicazioni }),
      ...(n_max_applicazioni != null && { n_max_applicazioni }),
      ...(n_max_applicazioni_um && { n_max_applicazioni_um }),
      ...(periodo_tempo && { periodo_tempo }),
      ...(colture_interessate && colture_interessate.length > 0 && { colture_interessate }),
      ...(raccomandazioni && { raccomandazioni }),
      ...(testo_completo && { testo_completo }),
    };
    output.push(resistance);
  }
  return output;
}

export function sanitizeLabel(raw: unknown): Label {
  const obj = typeof raw === 'object' && raw ? (raw as Record<string, unknown>) : {};
  const confRaw = obj['extraction_confidence'];
  const confNum = typeof confRaw === 'number' ? confRaw : Number(confRaw);
  const bounded = Number.isFinite(confNum) ? Math.max(0, Math.min(100, confNum)) : 0;
  const prodotto = typeof obj['prodotto'] === 'string' ? (obj['prodotto'] as string) : null;
  const categoria = typeof obj['categoria'] === 'string' ? (obj['categoria'] as string) : null;
  const formulazione =
    typeof obj['formulazione'] === 'string' || obj['formulazione'] === null
      ? (obj['formulazione'] as string | null) ?? null
      : null;
  const principio_attivo =
    typeof obj['principio_attivo'] === 'string' ? (obj['principio_attivo'] as string) : null;
  const composizione =
    typeof obj['composizione'] === 'string' ? (obj['composizione'] as string) : null;
  const meccanismo_azione_frac =
    typeof obj['meccanismo_azione_frac'] === 'string'
      ? (obj['meccanismo_azione_frac'] as string)
      : null;
  const fasce = coerceStringArray(obj['fasce_di_rispetto_e_deriva']);
  const frasi_pericolo = coerceStringArray(obj['frasi_pericolo']);
  const frasi_prudenza = coerceStringArray(obj['frasi_prudenza']);
  const compatibilita =
    typeof obj['compatibilita'] === 'string' ? (obj['compatibilita'] as string) : null;
  const fitotossicita =
    typeof obj['fitotossicita'] === 'string' ? (obj['fitotossicita'] as string) : null;
  const note_tecniche =
    typeof obj['note_tecniche'] === 'string' ? (obj['note_tecniche'] as string) : null;
  const numero_registrazione =
    typeof obj['numero_registrazione'] === 'string' || obj['numero_registrazione'] === null
      ? (obj['numero_registrazione'] as string | null) ?? null
      : null;
  const titolare =
    typeof obj['titolare'] === 'string' || obj['titolare'] === null
      ? (obj['titolare'] as string | null) ?? null
      : null;
  const stabilimento =
    typeof obj['stabilimento'] === 'string' || obj['stabilimento'] === null
      ? (obj['stabilimento'] as string | null) ?? null
      : null;
  const caratteristiche =
    typeof obj['caratteristiche'] === 'string' || obj['caratteristiche'] === null
      ? (obj['caratteristiche'] as string | null) ?? null
      : null;
  return {
    prodotto,
    categoria,
    formulazione,
    principio_attivo,
    composizione,
    meccanismo_azione_frac,
    malattie: coerceStringArray(obj['malattie']),
    specie: deduplicatePreservingOrder(coerceStringArray(obj['specie']).map(normalizeSpeciesName)),
    colture_target: deduplicatePreservingOrder(
      coerceStringArray(obj['colture_target']).map(normalizeSpeciesName),
    ),
    colture_target_fuori_periodo_di_prodizione:
      obj['colture_target_fuori_periodo_di_prodizione'] === null ||
      (Array.isArray(obj['colture_target_fuori_periodo_di_prodizione']) &&
        obj['colture_target_fuori_periodo_di_prodizione'].length === 0)
        ? null
        : deduplicatePreservingOrder(
            coerceStringArray(obj['colture_target_fuori_periodo_di_prodizione']).map(
              normalizeSpeciesName,
            ),
          ),
    dosaggi_dettagliati: coerceDosaggiDettagliati(obj['dosaggi_dettagliati']),
    fasce_di_rispetto_e_deriva: fasce,
    avvertenze: coerceStringArray(obj['avvertenze']),
    frasi_pericolo,
    frasi_prudenza,
    compatibilita,
    fitotossicita,
    note_tecniche,
    resistenze: coerceResistenze(obj['resistenze']),
    extraction_confidence: bounded,
    extracted_fields: coerceStringArray(obj['extracted_fields']),
    errors: coerceStringArray(obj['errors']),
    numero_registrazione,
    titolare,
    stabilimento,
    caratteristiche,
  };
}
