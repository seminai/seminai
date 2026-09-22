import * as fs from 'fs';
import * as path from 'path';
import { cleanRegNumber } from './cleanRegNumber';

/**
 * Struttura di un record fitosanitario dal dataset ministeriale
 */
interface FitosanitarioRecord {
  readonly num_registrazione: string;
  readonly denominazione_prodotto: string;
  readonly stato_amministrativo: string;
  readonly 'motivo_della revoca'?: string;
  readonly data_decorrenza_revoca?: string;
}

/**
 * Informazioni sulla revoca di un prodotto
 */
export interface RevokedProductInfo {
  readonly regNumber: string;
  readonly productName: string;
  readonly revokeDate: string | null;
  readonly revokeReason: string | null;
}

/**
 * Risultato del controllo revoca
 */
export interface RevokeCheckResult {
  readonly isRevoked: boolean;
  readonly info: RevokedProductInfo | null;
}

// Cache singleton per i dati fitosanitari
let cachedRevokedProducts: Map<string, RevokedProductInfo> | null = null;
let cachedRevokedProductsByName: Map<string, RevokedProductInfo> | null = null;
let cachedAllRegNumbers: Set<string> | null = null;
let cachedActiveProductNames: Set<string> | null = null;
let datasetLoadFailed: boolean = false;
let datasetLoadError: string | null = null;

/**
 * Verifica se il dataset dei prodotti revocati è stato caricato correttamente.
 * Utile per informare l'utente se il controllo revoca non è disponibile.
 */
export function isRevokedDatasetAvailable(): { available: boolean; error: string | null } {
  loadFitosanitariDataset(); // Ensure it's loaded
  return {
    available:
      !datasetLoadFailed && cachedRevokedProducts !== null && cachedRevokedProducts.size > 0,
    error: datasetLoadError,
  };
}

/**
 * Carica il dataset dei fitosanitari dal file JSON.
 * Viene caricato una sola volta e messo in cache.
 *
 * Builds four structures:
 * - byRegNumber: revoked products indexed by cleaned registration number
 * - byName: revoked products indexed by normalized product name
 * - allRegNumbers: ALL registration numbers in the dataset (revoked or not)
 * - activeNames: product names that have at least one non-revoked record
 */
function loadFitosanitariDataset(): {
  byRegNumber: Map<string, RevokedProductInfo>;
  byName: Map<string, RevokedProductInfo>;
  allRegNumbers: Set<string>;
  activeNames: Set<string>;
} {
  if (
    cachedRevokedProducts !== null &&
    cachedRevokedProductsByName !== null &&
    cachedAllRegNumbers !== null &&
    cachedActiveProductNames !== null
  ) {
    return {
      byRegNumber: cachedRevokedProducts,
      byName: cachedRevokedProductsByName,
      allRegNumbers: cachedAllRegNumbers,
      activeNames: cachedActiveProductNames,
    };
  }

  const byRegNumber = new Map<string, RevokedProductInfo>();
  const byName = new Map<string, RevokedProductInfo>();
  const allRegNumbers = new Set<string>();
  const activeNames = new Set<string>();

  try {
    const datasetPath = path.resolve(
      __dirname,
      '../../../../../dataset/fitosanitari/fts_06062025.json',
    );
    const rawData = fs.readFileSync(datasetPath, 'utf-8');
    const records: FitosanitarioRecord[] = JSON.parse(rawData);

    for (const record of records) {
      const cleanedRegNum = cleanRegNumber(record.num_registrazione);
      const normalizedName = record.denominazione_prodotto?.trim().toLowerCase() || '';
      const isRevoked = record.stato_amministrativo?.toLowerCase() === 'revocato';

      if (cleanedRegNum) {
        allRegNumbers.add(cleanedRegNum);
      }

      if (isRevoked) {
        const revokeDate = record.data_decorrenza_revoca;
        const revokeReason = record['motivo_della revoca'];

        const info: RevokedProductInfo = {
          regNumber: record.num_registrazione,
          productName: record.denominazione_prodotto,
          revokeDate: revokeDate && revokeDate !== '-' ? revokeDate : null,
          revokeReason: revokeReason && revokeReason !== '-' ? revokeReason : null,
        };

        if (cleanedRegNum) {
          byRegNumber.set(cleanedRegNum, info);
        }
        if (normalizedName) {
          byName.set(normalizedName, info);
        }
      } else {
        if (normalizedName) {
          activeNames.add(normalizedName);
        }
      }
    }

    console.log(
      `[REVOKED-CHECKER] Loaded ${byRegNumber.size} revoked products by regNumber, ${byName.size} by name, ${allRegNumbers.size} total regNumbers, ${activeNames.size} active names`,
    );
    datasetLoadFailed = false;
    datasetLoadError = null;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error('[REVOKED-CHECKER] Failed to load fitosanitari dataset:', error);
    datasetLoadFailed = true;
    datasetLoadError = `Impossibile caricare il database dei prodotti revocati: ${errorMsg}`;
  }

  cachedRevokedProducts = byRegNumber;
  cachedRevokedProductsByName = byName;
  cachedAllRegNumbers = allRegNumbers;
  cachedActiveProductNames = activeNames;

  return { byRegNumber, byName, allRegNumbers, activeNames };
}

/**
 * Controlla se un prodotto è revocato.
 * Cerca prima per numero di registrazione, poi per nome prodotto.
 *
 * Logica di sicurezza anti falsi positivi:
 * - Se il regNumber esiste nel dataset ministeriale ma NON è revocato, restituisce false
 *   senza fare il fallback per nome (il dataset ministeriale è la fonte autorevole).
 * - Il fallback per nome scatta solo quando il regNumber non è presente nel dataset.
 * - Il fallback per nome NON segna come revocato se esiste almeno una versione attiva
 *   con lo stesso nome commerciale (es. STARANE GOLD rinnovato con altro num. registrazione).
 */
export function checkProductRevoked(
  regNumber?: string | null,
  productName?: string | null,
): RevokeCheckResult {
  const { byRegNumber, byName, allRegNumbers, activeNames } = loadFitosanitariDataset();

  if (regNumber) {
    const cleanedRegNum = cleanRegNumber(regNumber);
    if (cleanedRegNum) {
      if (byRegNumber.has(cleanedRegNum)) {
        return { isRevoked: true, info: byRegNumber.get(cleanedRegNum)! };
      }
      if (allRegNumbers.has(cleanedRegNum)) {
        return { isRevoked: false, info: null };
      }
    }
  }

  if (productName) {
    const normalizedName = productName.trim().toLowerCase();
    if (normalizedName && byName.has(normalizedName) && !activeNames.has(normalizedName)) {
      return { isRevoked: true, info: byName.get(normalizedName)! };
    }
  }

  return { isRevoked: false, info: null };
}

/**
 * Controlla un batch di prodotti per revoca.
 * Restituisce una mappa con i risultati per ogni prodotto.
 *
 * @param products - Array di prodotti da controllare
 * @returns Mappa con chiave "regNumber|name" e valore RevokeCheckResult
 */
export function checkProductsBatchRevoked(
  products: ReadonlyArray<{ regNumber?: string | null; name?: string | null }>,
): Map<string, RevokeCheckResult> {
  const results = new Map<string, RevokeCheckResult>();

  for (const product of products) {
    const key = `${product.regNumber || ''}|${product.name || ''}`;
    const result = checkProductRevoked(product.regNumber, product.name);
    results.set(key, result);
  }

  return results;
}

/**
 * Checks whether a product exists in the ministerial dataset and is NOT revoked.
 * Used to short-circuit external lookups (e.g. Tavily) when we already know the product is active.
 */
export function isProductActiveInDataset(
  regNumber?: string | null,
  productName?: string | null,
): boolean {
  const { byRegNumber, allRegNumbers, activeNames } = loadFitosanitariDataset();

  if (regNumber) {
    const cleanedRegNum = cleanRegNumber(regNumber);
    if (cleanedRegNum && allRegNumbers.has(cleanedRegNum) && !byRegNumber.has(cleanedRegNum)) {
      return true;
    }
  }

  if (productName) {
    const normalizedName = productName.trim().toLowerCase();
    if (normalizedName && activeNames.has(normalizedName)) {
      return true;
    }
  }

  return false;
}

/**
 * Genera un messaggio di warning se il dataset revoche non è disponibile.
 * Da includere nelle warning della risposta API.
 */
export function getRevokedDatasetWarning(): string | null {
  const { available, error } = isRevokedDatasetAvailable();
  if (available) {
    return null;
  }
  return (
    error ||
    'Il controllo prodotti revocati non è disponibile. Verificare manualmente lo stato dei prodotti.'
  );
}

/**
 * Genera un messaggio di esclusione per un prodotto revocato.
 */
export function buildRevokedExclusionMessage(info: RevokedProductInfo): string {
  let message = `Prodotto revocato dal Ministero della Salute`;

  if (info.revokeDate) {
    message += ` dal ${info.revokeDate}`;
  }

  if (info.revokeReason) {
    message += `. Motivo: ${info.revokeReason}`;
  }

  message += `. Non è più autorizzato per l'uso.`;

  return message;
}
