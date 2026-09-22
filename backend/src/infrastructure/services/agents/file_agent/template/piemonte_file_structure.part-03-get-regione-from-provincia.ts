/**
 * Get region name from provincia code
 */
export function getRegioneFromProvincia(provincia: string): string {
  const prov = provincia?.toUpperCase().trim();

  // Piemonte provinces
  const piemonteProvinces = ['AL', 'AT', 'BI', 'CN', 'NO', 'TO', 'VB', 'VC'];
  if (piemonteProvinces.includes(prov)) {
    return 'PIEMONTE';
  }

  // Emilia-Romagna provinces
  const emiliaRomagnaProvinces = ['BO', 'FE', 'FC', 'MO', 'PR', 'PC', 'RA', 'RE', 'RN'];
  if (emiliaRomagnaProvinces.includes(prov)) {
    return 'EMILIA ROMAGNA';
  }

  // Lombardia provinces
  const lombardiaProvinces = [
    'BG',
    'BS',
    'CO',
    'CR',
    'LC',
    'LO',
    'MN',
    'MI',
    'MB',
    'PV',
    'SO',
    'VA',
  ];
  if (lombardiaProvinces.includes(prov)) {
    return 'LOMBARDIA';
  }

  return 'ITALIA';
}

/**
 * Known comuni in Emilia-Romagna (commonly found in agricultural data)
 */
export const EMILIA_ROMAGNA_COMUNI = new Set([
  'ALFONSINE',
  'ARGENTA',
  'BAGNACAVALLO',
  'BAGNARA DI ROMAGNA',
  'BERTINORO',
  'BOLOGNA',
  'BONDENO',
  'BRISIGHELLA',
  'BUDRIO',
  'CASOLA VALSENIO',
  'CASTEL BOLOGNESE',
  'CASTEL GUELFO DI BOLOGNA',
  'CASTEL SAN PIETRO TERME',
  'CASTELLARANO',
  'CASTROCARO TERME E TERRA DEL SOLE',
  'CERVIA',
  'CESENA',
  'CESENATICO',
  'CODIGORO',
  'COMACCHIO',
  'CONSELICE',
  'COTIGNOLA',
  'FAENZA',
  'FERRARA',
  'FORLI',
  'FORLIMPOPOLI',
  'FUSIGNANO',
  'GAMBETTOLA',
  'IMOLA',
  'LUGO',
  'MASSA LOMBARDA',
  'MEDICINA',
  'MODENA',
  'MOLINELLA',
  'MORDANO',
  'OSTELLATO',
  'PARMA',
  'PIACENZA',
  'RAVENNA',
  'REGGIO EMILIA',
  'RIOLO TERME',
  'RIMINI',
  'RUSSI',
  "SANT'AGATA SUL SANTERNO",
  'SOLAROLO',
  'SASSO MARCONI',
  'SAN LAZZARO DI SAVENA',
]);

/**
 * Get region name from comune name (when provincia is not available)
 */
export function getRegioneFromComune(comune: string): string | null {
  if (!comune) return null;

  const comuneUpper = comune.toUpperCase().trim();

  if (EMILIA_ROMAGNA_COMUNI.has(comuneUpper)) {
    return 'EMILIA ROMAGNA';
  }

  return null;
}

/**
 * Parse epoca semina to determine planting season
 */
export function parseEpocaSemina(epocaSemina: string): 'autumn-winter' | 'spring-summer' | null {
  if (!epocaSemina) return null;

  const upper = epocaSemina.toUpperCase().trim();

  if (upper.includes('AUTUNNO') || upper.includes('INVERNO')) {
    return 'autumn-winter';
  }
  if (upper.includes('PRIMAVERA') || upper.includes('ESTATE')) {
    return 'spring-summer';
  }

  return null;
}

/**
 * Parse tipo semina
 */
export function parseTipoSemina(tipoSemina: string): string | null {
  if (!tipoSemina || tipoSemina.trim() === '' || tipoSemina.includes('NON PREVISTO')) {
    return null;
  }
  return tipoSemina.trim();
}

/**
 * Parse zona altimetrica
 */
export function parseZonaAltimetrica(zonaAlt: string): 'pianura' | 'collina' | 'montagna' | null {
  if (!zonaAlt) return null;

  const lower = zonaAlt.toLowerCase().trim();

  if (lower.includes('pianura')) return 'pianura';
  if (lower.includes('collina')) return 'collina';
  if (lower.includes('montagna')) return 'montagna';

  return null;
}

/**
 * Check if particella is irrigable
 */
export function isIrrigable(potenzialitaIrrigua: string): boolean {
  if (!potenzialitaIrrigua) return false;
  const lower = potenzialitaIrrigua.toLowerCase();
  return !lower.includes('non irrigua');
}

/**
 * Parse rotazione colturale type
 */
export function parseRotazioneColturale(
  rotazione: string,
): 'seminativo' | 'senza_rotazione' | null {
  if (!rotazione) return null;

  const lower = rotazione.toLowerCase();

  if (lower.includes('ciclo seminativo')) {
    return 'seminativo';
  }
  if (lower.includes('senza rotazione')) {
    return 'senza_rotazione';
  }

  return null;
}
