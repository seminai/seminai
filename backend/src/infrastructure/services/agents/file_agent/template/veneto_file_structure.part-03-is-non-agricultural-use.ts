/**
 * Check if a row represents a non-agricultural use
 */
export function isNonAgriculturalUse(occupazioneSuolo: string): boolean {
  if (!occupazioneSuolo) return false;
  const upper = occupazioneSuolo.toUpperCase();
  return (
    upper.includes('USO NON AGRICOLO') ||
    upper.includes('MANUFATTI') ||
    upper.includes('TARE') ||
    upper.includes('FOSSATI') ||
    upper.includes('FABBRICATI') ||
    upper.includes('SIEPI') ||
    upper.includes('FASCE TAMPONE')
  );
}

/**
 * Check if the row is organic/biological
 */
export function isOrganicFromBio(bioBiologico: string): boolean {
  if (!bioBiologico) return false;
  const upper = bioBiologico.toUpperCase().trim();
  return upper === 'S' || upper === 'SI' || upper === 'Y' || upper === 'YES' || upper === 'BIO';
}

/**
 * Get region name from provincia code (Veneto provinces)
 */
export function getRegioneFromProvincia(provincia: string): string {
  const prov = provincia?.toUpperCase().trim();

  // Veneto provinces
  const venetoProvinces = ['VR', 'VI', 'VE', 'PD', 'TV', 'RO', 'BL'];
  if (venetoProvinces.includes(prov)) {
    return 'VENETO';
  }

  return 'ITALIA';
}

/**
 * Get region name from comune name (Veneto comuni)
 */
export function getRegioneFromComune(comune: string): string | null {
  if (!comune) return null;

  const comuneUpper = comune.toUpperCase().trim();

  // Common Veneto comuni
  const venetoComuni = new Set([
    'VERONA',
    'VENEZIA',
    'PADOVA',
    'VICENZA',
    'TREVISO',
    'ROVIGO',
    'BELLUNO',
    'BASSANO DEL GRAPPA',
    'CONEGLIANO',
    'JESOLO',
    'CHIOGGIA',
    'SAN DONA DI PIAVE',
    'MONTEBELLUNA',
    'CASTELFRANCO VENETO',
    'SCHIO',
    'MESTRE',
    'LEGNAGO',
    'VILLAFRANCA DI VERONA',
    'ABANO TERME',
    'ESTE',
    'MONTAGNANA',
  ]);

  if (venetoComuni.has(comuneUpper)) {
    return 'VENETO';
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

// ============================================================================
// VENETO AVEPA "Piano Utilizzo" Format
// ============================================================================

/**
 * Column mapping for Veneto AVEPA "Piano Utilizzo" format
 *
 * This format is used by AVEPA (Agenzia Veneta per i Pagamenti) and has:
 * - Multi-row header with title, year, and status
 * - Column headers starting at row 22
 * - PAC AGEA codes in columns W-X
 *
 * Example file: "campi_elisa Adami.xls"
 */
export interface VenetoAVEPAColumnMapping {
  // Ubicazione
  comune: string;
  // Dati catastali
  sezione: string;
  foglio: string;
  particella: string;
  subalterno: string;
  // Superfici
  superficieCatastale: string;
  // Irrigazione
  potenzialitaIrrigua: string;
  // Ciclo
  presenzaCiclo: string;
  tipoCon: string;
  superficieCondotta: string;
  // Identificativi parcella
  parcellaRif: string;
  // Codice PAC AGEA (colonna con codice tipo 870-011-000-000-000)
  codicePacAgea: string;
  // Coltura
  primaColtura: string;
  // Caratteristiche
  serra: string;
  bio: string;
  // Superficie utilizzata
  superficieUtilizzata: string;
}
