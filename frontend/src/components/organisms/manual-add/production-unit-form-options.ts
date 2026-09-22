export const OTHER_SELECT_VALUE = '__other__' as const;

export const PROTOCOL_OPTIONS = [
  'Convenzionale',
  'Biologico',
  'Integrato',
  'Natura 2000',
  'Produzione integrata',
] as const;

export const STRUCTURE_OPTIONS = [
  'Nessuna',
  'Serra',
  'Tunnel',
  'Telo',
  'Coltura protetta',
] as const;

export const SOIL_USE_PRIMARY_OPTIONS = [
  'Seminativo',
  'Vigneto',
  'Oliveto',
  'Frutteto',
  'Pascolo',
  'Prato permanente',
  'Orto',
  'Coltura arborea',
] as const;

export const SOIL_USE_SECONDARY_OPTIONS = [
  'Nessuna',
  'Da seme',
  'Da trapianto',
  'Da vino',
  'Da tavola',
  'Da olio',
] as const;

export function toSelectOptions(values: readonly string[]): readonly { value: string; label: string }[] {
  return values.map((label) => ({ value: label, label }));
}
