/**
 * Get the region name from a province name.
 * This format provides full province names (e.g., "MODENA", "BOLOGNA").
 */
export function getRegioneFromProvincia(provincia: string): string | null {
  if (!provincia) return null;
  const prov = provincia.toUpperCase().trim();

  const provinciaToRegione: Record<string, string> = {
    // Emilia-Romagna
    BOLOGNA: 'EMILIA-ROMAGNA',
    FERRARA: 'EMILIA-ROMAGNA',
    'FORLI-CESENA': 'EMILIA-ROMAGNA',
    MODENA: 'EMILIA-ROMAGNA',
    PARMA: 'EMILIA-ROMAGNA',
    PIACENZA: 'EMILIA-ROMAGNA',
    RAVENNA: 'EMILIA-ROMAGNA',
    "REGGIO NELL'EMILIA": 'EMILIA-ROMAGNA',
    'REGGIO EMILIA': 'EMILIA-ROMAGNA',
    RIMINI: 'EMILIA-ROMAGNA',
    // Piemonte
    TORINO: 'PIEMONTE',
    ALESSANDRIA: 'PIEMONTE',
    ASTI: 'PIEMONTE',
    BIELLA: 'PIEMONTE',
    CUNEO: 'PIEMONTE',
    NOVARA: 'PIEMONTE',
    VERBANIA: 'PIEMONTE',
    VERCELLI: 'PIEMONTE',
    // Lombardia
    MILANO: 'LOMBARDIA',
    BERGAMO: 'LOMBARDIA',
    BRESCIA: 'LOMBARDIA',
    COMO: 'LOMBARDIA',
    CREMONA: 'LOMBARDIA',
    LECCO: 'LOMBARDIA',
    LODI: 'LOMBARDIA',
    MANTOVA: 'LOMBARDIA',
    'MONZA E BRIANZA': 'LOMBARDIA',
    PAVIA: 'LOMBARDIA',
    SONDRIO: 'LOMBARDIA',
    VARESE: 'LOMBARDIA',
    // Veneto
    VENEZIA: 'VENETO',
    VERONA: 'VENETO',
    VICENZA: 'VENETO',
    PADOVA: 'VENETO',
    TREVISO: 'VENETO',
    ROVIGO: 'VENETO',
    BELLUNO: 'VENETO',
    // Trentino-Alto Adige
    TRENTO: 'TRENTINO-ALTO ADIGE',
    BOLZANO: 'TRENTINO-ALTO ADIGE',
    // Friuli-Venezia Giulia
    TRIESTE: 'FRIULI VENEZIA GIULIA',
    GORIZIA: 'FRIULI VENEZIA GIULIA',
    PORDENONE: 'FRIULI VENEZIA GIULIA',
    UDINE: 'FRIULI VENEZIA GIULIA',
    // Toscana
    FIRENZE: 'TOSCANA',
    AREZZO: 'TOSCANA',
    GROSSETO: 'TOSCANA',
    LIVORNO: 'TOSCANA',
    LUCCA: 'TOSCANA',
    MASSA: 'TOSCANA',
    PISA: 'TOSCANA',
    PISTOIA: 'TOSCANA',
    PRATO: 'TOSCANA',
    SIENA: 'TOSCANA',
    // Lazio
    ROMA: 'LAZIO',
    FROSINONE: 'LAZIO',
    LATINA: 'LAZIO',
    RIETI: 'LAZIO',
    VITERBO: 'LAZIO',
    // Campania
    NAPOLI: 'CAMPANIA',
    AVELLINO: 'CAMPANIA',
    BENEVENTO: 'CAMPANIA',
    CASERTA: 'CAMPANIA',
    SALERNO: 'CAMPANIA',
    // Puglia
    BARI: 'PUGLIA',
    BRINDISI: 'PUGLIA',
    FOGGIA: 'PUGLIA',
    LECCE: 'PUGLIA',
    TARANTO: 'PUGLIA',
    // Sicilia
    PALERMO: 'SICILIA',
    AGRIGENTO: 'SICILIA',
    CALTANISSETTA: 'SICILIA',
    CATANIA: 'SICILIA',
    ENNA: 'SICILIA',
    MESSINA: 'SICILIA',
    RAGUSA: 'SICILIA',
    SIRACUSA: 'SICILIA',
    TRAPANI: 'SICILIA',
    // Sardegna
    CAGLIARI: 'SARDEGNA',
    NUORO: 'SARDEGNA',
    ORISTANO: 'SARDEGNA',
    SASSARI: 'SARDEGNA',
    // Abruzzo
    "L'AQUILA": 'ABRUZZO',
    CHIETI: 'ABRUZZO',
    PESCARA: 'ABRUZZO',
    TERAMO: 'ABRUZZO',
    // Marche
    ANCONA: 'MARCHE',
    ASCOLI: 'MARCHE',
    FERMO: 'MARCHE',
    MACERATA: 'MARCHE',
    PESARO: 'MARCHE',
    // Umbria
    PERUGIA: 'UMBRIA',
    TERNI: 'UMBRIA',
    // Calabria
    CATANZARO: 'CALABRIA',
    COSENZA: 'CALABRIA',
    CROTONE: 'CALABRIA',
    'REGGIO CALABRIA': 'CALABRIA',
    'VIBO VALENTIA': 'CALABRIA',
    // Basilicata
    POTENZA: 'BASILICATA',
    MATERA: 'BASILICATA',
    // Molise
    CAMPOBASSO: 'MOLISE',
    ISERNIA: 'MOLISE',
    // Liguria
    GENOVA: 'LIGURIA',
    IMPERIA: 'LIGURIA',
    SAVONA: 'LIGURIA',
    'LA SPEZIA': 'LIGURIA',
    // Valle d'Aosta
    AOSTA: "VALLE D'AOSTA",
  };

  return provinciaToRegione[prov] || null;
}

/**
 * Normalize grape variety name.
 * Cleans up names like "LAMBRUSCO SALAMINO N." -> "Lambrusco Salamino"
 * The trailing letter (N., B., Rs., etc.) is the grape color code.
 */
export function normalizeVitignoName(vitigno: string): {
  name: string;
  colorCode: string | null;
} {
  if (!vitigno) return { name: '', colorCode: null };

  const trimmed = vitigno.trim();

  // Match trailing color code: N. (nero), B. (bianco), Rs. (rosato/rosé), G. (grigio)
  const colorMatch = trimmed.match(/\s+(N\.|B\.|Rs\.|G\.|R\.)$/i);
  let colorCode: string | null = null;
  let name = trimmed;

  if (colorMatch) {
    colorCode = colorMatch[1].replace('.', '').toUpperCase();
    name = trimmed.slice(0, -colorMatch[0].length).trim();
  }

  // Title case the name
  name = name
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return { name, colorCode };
}
