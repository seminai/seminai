import { type FertilizerAgronomicInstructions, type FertilizerApplicationRates, type FertilizerClpInformation, type FertilizerCropDose, type FertilizerGuaranteedComposition, type FertilizerLabel, type FertilizerProductUe } from '../../../domain/dtos/fertilizer-label.dto';
import { sanitizeComponentsAboveThreshold, sanitizeMesoElements, sanitizeMicronutrients, sanitizeNitrogenForms, sanitizeNpkAnalysis, sanitizeOrganicParameters, sanitizePhosphorusSolubility, sanitizePhysicoChemical, sanitizeProductIdentification, toOptionalNumber, toOptionalString, toStringArray } from './fertilizerLabelSanitizer.part-01-to-optional-string';

export function sanitizeGuaranteedComposition(value: unknown): FertilizerGuaranteedComposition | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const analisi_principale_NPK_percentuale_peso = sanitizeNpkAnalysis(
    record['analisi_principale_NPK_percentuale_peso'],
  );
  const meso_elementi_percentuale_peso = sanitizeMesoElements(
    record['meso_elementi_percentuale_peso'],
  );
  const forme_azoto = sanitizeNitrogenForms(record['forme_azoto']);
  const solubilita_fosforo = sanitizePhosphorusSolubility(record['solubilita_fosforo']);
  const micronutrienti = sanitizeMicronutrients(record['micronutrienti']);
  const parametri_organici_biologici = sanitizeOrganicParameters(
    record['parametri_organici_biologici'],
  );
  const elenco_componenti_sopra_5_percento = sanitizeComponentsAboveThreshold(
    record['elenco_componenti_sopra_5_percento'],
  );
  const caratteristiche_chimico_fisiche = sanitizePhysicoChemical(
    record['caratteristiche_chimico_fisiche'],
  );

  if (
    !analisi_principale_NPK_percentuale_peso &&
    !meso_elementi_percentuale_peso &&
    forme_azoto.length === 0 &&
    !solubilita_fosforo &&
    micronutrienti.length === 0 &&
    !parametri_organici_biologici &&
    elenco_componenti_sopra_5_percento.length === 0 &&
    !caratteristiche_chimico_fisiche
  ) {
    return null;
  }
  return {
    analisi_principale_NPK_percentuale_peso,
    meso_elementi_percentuale_peso,
    forme_azoto,
    solubilita_fosforo,
    micronutrienti,
    parametri_organici_biologici,
    elenco_componenti_sopra_5_percento,
    caratteristiche_chimico_fisiche,
  };
}

export function sanitizeCropDoses(value: unknown): ReadonlyArray<FertilizerCropDose> {
  if (!Array.isArray(value)) return [];
  const doses: FertilizerCropDose[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const coltura = toOptionalString(record['coltura']);
    const dose_kg_ha_min = toOptionalNumber(record['dose_kg_ha_min']);
    const dose_kg_ha_max = toOptionalNumber(record['dose_kg_ha_max']);
    const fase_fenologica = toOptionalString(record['fase_fenologica']);
    if (!coltura && dose_kg_ha_min == null && dose_kg_ha_max == null && !fase_fenologica) continue;
    doses.push({ coltura, dose_kg_ha_min, dose_kg_ha_max, fase_fenologica });
  }
  return doses;
}

export function sanitizeApplicationRates(value: unknown): FertilizerApplicationRates | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const generale_kg_per_ettaro = toOptionalNumber(record['generale_kg_per_ettaro']);
  const specifiche_coltura = sanitizeCropDoses(record['specifiche_coltura']);
  if (generale_kg_per_ettaro == null && specifiche_coltura.length === 0) {
    return null;
  }
  return { generale_kg_per_ettaro, specifiche_coltura };
}

export function sanitizeAgronomicInstructions(value: unknown): FertilizerAgronomicInstructions | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const uso_previsto = toOptionalString(record['uso_previsto']);
  const dosi_applicazione = sanitizeApplicationRates(record['dosi_applicazione']);
  const frequenza = toOptionalString(record['frequenza']);
  const condizioni_stoccaggio = toOptionalString(record['condizioni_stoccaggio']);
  if (!uso_previsto && !dosi_applicazione && !frequenza && !condizioni_stoccaggio) {
    return null;
  }
  return { uso_previsto, dosi_applicazione, frequenza, condizioni_stoccaggio };
}

export function sanitizeClpInformation(value: unknown): FertilizerClpInformation | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const avvertenza = toOptionalString(record['avvertenza']);
  const pittogrammi_pericolo = toStringArray(record['pittogrammi_pericolo']);
  const indicazioni_pericolo_H = toStringArray(record['indicazioni_pericolo_H']);
  const consigli_prudenza_P = toStringArray(record['consigli_prudenza_P']);
  const note_mediche = toOptionalString(record['note_mediche']);
  if (
    !avvertenza &&
    pittogrammi_pericolo.length === 0 &&
    indicazioni_pericolo_H.length === 0 &&
    consigli_prudenza_P.length === 0 &&
    !note_mediche
  ) {
    return null;
  }
  return {
    avvertenza,
    pittogrammi_pericolo,
    indicazioni_pericolo_H,
    consigli_prudenza_P,
    note_mediche,
  };
}

export function sanitizeProductUe(value: unknown): FertilizerProductUe | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const identificazione_prodotto = sanitizeProductIdentification(
    record['identificazione_prodotto'],
  );
  const composizione_garantita = sanitizeGuaranteedComposition(record['composizione_garantita']);
  const istruzioni_uso_agronomiche = sanitizeAgronomicInstructions(
    record['istruzioni_uso_agronomiche'],
  );
  const informazioni_sicurezza_clp = sanitizeClpInformation(record['informazioni_sicurezza_clp']);
  if (
    !identificazione_prodotto &&
    !composizione_garantita &&
    !istruzioni_uso_agronomiche &&
    !informazioni_sicurezza_clp
  ) {
    return null;
  }
  return {
    identificazione_prodotto,
    composizione_garantita,
    istruzioni_uso_agronomiche,
    informazioni_sicurezza_clp,
  };
}

export function sanitizeFertilizerLabel(raw: unknown): FertilizerLabel {
  const record = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  return {
    prodotto_fertilizzante_ue: sanitizeProductUe(record['prodotto_fertilizzante_ue']),
  };
}
