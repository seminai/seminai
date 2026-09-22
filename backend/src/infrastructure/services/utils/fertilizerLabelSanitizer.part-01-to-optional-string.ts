import { type FertilizerComponentAboveThreshold, type FertilizerGuaranteedComposition, type FertilizerMicronutrient, type FertilizerNitrogenForm, type FertilizerNominalQuantity, type FertilizerPhosphorusSolubility, type FertilizerProductIdentification, type FertilizerMesoElements, type FertilizerOrganicParameters, type FertilizerPhysicoChemicalCharacteristics } from '../../../domain/dtos/fertilizer-label.dto';

export function toOptionalString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

export function toOptionalNumber(value: unknown): number | null {
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

export function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => toOptionalString(entry))
    .filter((entry): entry is string => Boolean(entry));
}

export function sanitizeNominalQuantity(value: unknown): FertilizerNominalQuantity | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  const quantity = toOptionalNumber(record['valore']);
  const unit = toOptionalString(record['unita']);
  if (quantity == null && !unit) return null;
  return { valore: quantity, unita: unit };
}

export function sanitizeProductIdentification(value: unknown): FertilizerProductIdentification | null {
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

export function sanitizeNpkAnalysis(
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

export function sanitizeMesoElements(value: unknown): FertilizerMesoElements | null {
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

export function sanitizeNitrogenForms(value: unknown): ReadonlyArray<FertilizerNitrogenForm> {
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

export function sanitizePhosphorusSolubility(value: unknown): FertilizerPhosphorusSolubility | null {
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

export function sanitizeMicronutrients(value: unknown): ReadonlyArray<FertilizerMicronutrient> {
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

export function sanitizeOrganicParameters(value: unknown): FertilizerOrganicParameters | null {
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

export function sanitizeComponentsAboveThreshold(
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

export function sanitizePhysicoChemical(value: unknown): FertilizerPhysicoChemicalCharacteristics | null {
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
