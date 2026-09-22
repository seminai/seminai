import {
  type FertilizerAgronomicInstructions,
  type FertilizerApplicationRates,
  type FertilizerClpInformation,
  type FertilizerComponentAboveThreshold,
  type FertilizerCropDose,
  type FertilizerGuaranteedComposition,
  type FertilizerLabel,
  type FertilizerMicronutrient,
  type FertilizerNitrogenForm,
  type FertilizerNominalQuantity,
  type FertilizerPhosphorusSolubility,
  type FertilizerProductIdentification,
  type FertilizerProductUe,
  type FertilizerMesoElements,
  type FertilizerOrganicParameters,
  type FertilizerPhysicoChemicalCharacteristics,
} from '../../../domain/dtos/fertilizer-label.dto';

function toOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function toOptionalNumber(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) return null;
    const parsed = Number(trimmed.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function sanitizeNominalQuantity(value: unknown): FertilizerNominalQuantity | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const quantity = toOptionalNumber(record['valore']);
  const unit = toOptionalString(record['unita']);
  if (quantity == null && !unit) return null;
  return { valore: quantity, unita: unit };
}

function sanitizeProductIdentification(value: unknown): FertilizerProductIdentification | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const nome_commerciale = toOptionalString(record['nome_commerciale']);
  const funzione_categoria_prodotto = toOptionalString(record['funzione_categoria_prodotto']);
  const numero_lotto = toOptionalString(record['numero_lotto']);
  const stato_fisico = toOptionalString(record['stato_fisico']);
  const confezioni_disponibili = toStringArray(record['confezioni_disponibili']);
  const quantita_nominale = sanitizeNominalQuantity(record['quantita_nominale']);
  if (
    !nome_commerciale &&
    !funzione_categoria_prodotto &&
    !numero_lotto &&
    !quantita_nominale &&
    !stato_fisico &&
    confezioni_disponibili.length === 0
  ) {
    return null;
  }
  return {
    nome_commerciale,
    funzione_categoria_prodotto,
    numero_lotto,
    stato_fisico,
    confezioni_disponibili,
    quantita_nominale,
  };
}

function sanitizeNpkAnalysis(
  value: unknown,
): FertilizerGuaranteedComposition['analisi_principale_NPK_percentuale_peso'] {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const N_totale = toOptionalNumber(record['N_totale']);
  const P2O5_totale = toOptionalNumber(record['P2O5_totale']);
  const K2O_totale = toOptionalNumber(record['K2O_totale']);
  if (N_totale == null && P2O5_totale == null && K2O_totale == null) {
    return null;
  }
  return { N_totale, P2O5_totale, K2O_totale };
}

function sanitizeMesoElements(value: unknown): FertilizerMesoElements | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const CaO_totale = toOptionalNumber(record['CaO_totale']);
  const MgO_totale = toOptionalNumber(record['MgO_totale']);
  const SO3_totale = toOptionalNumber(record['SO3_totale']);
  const Na2O_totale = toOptionalNumber(record['Na2O_totale']);
  if (CaO_totale == null && MgO_totale == null && SO3_totale == null && Na2O_totale == null) {
    return null;
  }
  return { CaO_totale, MgO_totale, SO3_totale, Na2O_totale };
}

function sanitizeNitrogenForms(value: unknown): ReadonlyArray<FertilizerNitrogenForm> {
  if (!Array.isArray(value)) return [];
  const forms: FertilizerNitrogenForm[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const tipo = toOptionalString(record['tipo']);
    const percentuale = toOptionalNumber(record['percentuale']);
    if (!tipo && percentuale == null) continue;
    forms.push({ tipo, percentuale });
  }
  return forms;
}

function sanitizePhosphorusSolubility(value: unknown): FertilizerPhosphorusSolubility | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const P2O5_solubile_acqua = toOptionalNumber(record['P2O5_solubile_acqua']);
  const P2O5_solubile_citrato_ammonio_neutro = toOptionalNumber(
    record['P2O5_solubile_citrato_ammonio_neutro'],
  );
  if (P2O5_solubile_acqua == null && P2O5_solubile_citrato_ammonio_neutro == null) {
    return null;
  }
  return { P2O5_solubile_acqua, P2O5_solubile_citrato_ammonio_neutro };
}

function sanitizeMicronutrients(value: unknown): ReadonlyArray<FertilizerMicronutrient> {
  if (!Array.isArray(value)) return [];
  const micronutrients: FertilizerMicronutrient[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const elemento = toOptionalString(record['elemento']);
    const percentuale = toOptionalNumber(record['percentuale']);
    const unita = toOptionalString(record['unita']);
    if (!elemento && percentuale == null && !unita) continue;
    micronutrients.push({ elemento, percentuale, unita });
  }
  return micronutrients;
}

function sanitizeOrganicParameters(value: unknown): FertilizerOrganicParameters | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const carbonio_organico_biologico = toOptionalNumber(record['carbonio_organico_biologico']);
  const acidi_umici_fulvici = toOptionalNumber(record['acidi_umici_fulvici']);
  const sostanza_organica = toOptionalNumber(record['sostanza_organica']);
  if (
    carbonio_organico_biologico == null &&
    acidi_umici_fulvici == null &&
    sostanza_organica == null
  ) {
    return null;
  }
  return { carbonio_organico_biologico, acidi_umici_fulvici, sostanza_organica };
}

function sanitizeComponentsAboveThreshold(
  value: unknown,
): ReadonlyArray<FertilizerComponentAboveThreshold> {
  if (!Array.isArray(value)) return [];
  const components: FertilizerComponentAboveThreshold[] = [];
  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;
    const record = entry as Record<string, unknown>;
    const ingrediente = toOptionalString(record['ingrediente']);
    const CMC = toOptionalString(record['CMC']);
    if (!ingrediente && !CMC) continue;
    components.push({ ingrediente, CMC });
  }
  return components;
}

function sanitizePhysicoChemical(value: unknown): FertilizerPhysicoChemicalCharacteristics | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const pH = toOptionalNumber(record['pH']);
  const densita_20_gradi = toOptionalNumber(record['densita_20_gradi']);
  const salinita = toOptionalNumber(record['salinita']);
  if (pH == null && densita_20_gradi == null && salinita == null) {
    return null;
  }
  return { pH, densita_20_gradi, salinita };
}

function sanitizeGuaranteedComposition(value: unknown): FertilizerGuaranteedComposition | null {
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

function sanitizeCropDoses(value: unknown): ReadonlyArray<FertilizerCropDose> {
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

function sanitizeApplicationRates(value: unknown): FertilizerApplicationRates | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const generale_kg_per_ettaro = toOptionalNumber(record['generale_kg_per_ettaro']);
  const specifiche_coltura = sanitizeCropDoses(record['specifiche_coltura']);
  if (generale_kg_per_ettaro == null && specifiche_coltura.length === 0) {
    return null;
  }
  return { generale_kg_per_ettaro, specifiche_coltura };
}

function sanitizeAgronomicInstructions(value: unknown): FertilizerAgronomicInstructions | null {
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

function sanitizeClpInformation(value: unknown): FertilizerClpInformation | null {
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

function sanitizeProductUe(value: unknown): FertilizerProductUe | null {
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
