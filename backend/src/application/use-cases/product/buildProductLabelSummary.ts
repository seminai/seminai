import { Label, LabelDoseDetail, isFitoLabel } from '../../../domain/dtos/label.dto';
import {
  FertilizerApplicationRates,
  FertilizerGuaranteedComposition,
  FertilizerLabel,
} from '../../../domain/dtos/fertilizer-label.dto';

export const PRODUCT_LABEL_SUMMARY_VERSION = 2;

export interface ProductLabelSummary {
  readonly summary_version: number;
  readonly principio_attivo: string | null;
  readonly formulazione: string | null;
  readonly composizione: string | null;
  readonly meccanismo_azione_frac: string | null;
  readonly titolare: string | null;
  readonly caratteristiche: string | null;
  readonly categoria: string | null;
  readonly colture_target: readonly string[];
  readonly malattie: readonly string[];
  readonly dosaggi_dettagliati: readonly LabelDoseDetail[];
  readonly labelExtractionId: string;
  readonly sourceUrl: string | null;
  readonly matchedAt: string;
}

export function isStaleSummary(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return true;
  const obj = metadata as Record<string, unknown>;
  if (typeof obj.labelExtractionId !== 'string' || obj.labelExtractionId.length === 0) {
    return true;
  }
  const version = typeof obj.summary_version === 'number' ? obj.summary_version : 0;
  return version < PRODUCT_LABEL_SUMMARY_VERSION;
}

function isFertilizerLabel(obj: unknown): obj is FertilizerLabel {
  if (!obj || typeof obj !== 'object') return false;
  return 'prodotto_fertilizzante_ue' in obj;
}

export function buildPesticideSummary(
  labelData: unknown,
  labelExtractionId: string,
): ProductLabelSummary {
  const label = isFitoLabel(labelData) ? (labelData as Label) : null;
  return {
    summary_version: PRODUCT_LABEL_SUMMARY_VERSION,
    principio_attivo: label?.principio_attivo ?? null,
    formulazione: label?.formulazione ?? null,
    composizione: label?.composizione ?? null,
    meccanismo_azione_frac: label?.meccanismo_azione_frac ?? null,
    titolare: label?.titolare ?? null,
    caratteristiche: label?.caratteristiche ?? null,
    categoria: label?.categoria ?? null,
    colture_target: label?.colture_target ?? [],
    malattie: label?.malattie ?? [],
    dosaggi_dettagliati: label?.dosaggi_dettagliati ?? [],
    labelExtractionId,
    sourceUrl: null,
    matchedAt: new Date().toISOString(),
  };
}

export function buildFertilizerSummary(
  labelData: unknown,
  labelExtractionId: string,
): ProductLabelSummary {
  const ue = isFertilizerLabel(labelData) ? labelData.prodotto_fertilizzante_ue : null;
  const identification = ue?.identificazione_prodotto ?? null;
  const composition = ue?.composizione_garantita ?? null;
  return {
    summary_version: PRODUCT_LABEL_SUMMARY_VERSION,
    principio_attivo: identification?.funzione_categoria_prodotto ?? null,
    formulazione: identification?.stato_fisico ?? null,
    composizione: formatFertilizerComposition(composition),
    meccanismo_azione_frac: null,
    titolare: null,
    caratteristiche: identification?.funzione_categoria_prodotto ?? null,
    categoria: 'FERTILIZER',
    colture_target: extractFertilizerCrops(
      ue?.istruzioni_uso_agronomiche?.dosi_applicazione ?? null,
    ),
    malattie: [],
    dosaggi_dettagliati: [],
    labelExtractionId,
    sourceUrl: null,
    matchedAt: new Date().toISOString(),
  };
}

function formatFertilizerComposition(
  composition: FertilizerGuaranteedComposition | null,
): string | null {
  if (!composition) return null;
  const parts: string[] = [];
  const npk = composition.analisi_principale_NPK_percentuale_peso;
  if (npk) {
    const npkParts = [
      npk.N_totale !== null ? `N ${npk.N_totale}%` : null,
      npk.P2O5_totale !== null ? `P2O5 ${npk.P2O5_totale}%` : null,
      npk.K2O_totale !== null ? `K2O ${npk.K2O_totale}%` : null,
    ].filter((p): p is string => p !== null);
    if (npkParts.length > 0) parts.push(npkParts.join(' · '));
  }
  const meso = composition.meso_elementi_percentuale_peso;
  if (meso) {
    const mesoParts = [
      meso.CaO_totale !== null ? `CaO ${meso.CaO_totale}%` : null,
      meso.MgO_totale !== null ? `MgO ${meso.MgO_totale}%` : null,
      meso.SO3_totale !== null ? `SO3 ${meso.SO3_totale}%` : null,
    ].filter((p): p is string => p !== null);
    if (mesoParts.length > 0) parts.push(mesoParts.join(' · '));
  }
  return parts.length === 0 ? null : parts.join(' | ');
}

function extractFertilizerCrops(rates: FertilizerApplicationRates | null): readonly string[] {
  if (!rates) return [];
  const crops = rates.specifiche_coltura
    .map((c) => c.coltura)
    .filter((c): c is string => typeof c === 'string' && c.length > 0);
  return [...new Set(crops)];
}
