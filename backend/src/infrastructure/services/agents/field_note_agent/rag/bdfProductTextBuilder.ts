/**
 * Utility functions to convert BDF product data into text format
 * optimized for semantic search and embedding.
 */

import type { BdfProdotto } from '../../../integrations/bdf/types';
import type { BdfProductDocument, BdfProductMetadata } from './types';

/**
 * SA name → mechanism of action map, built from BDF API data.
 * Keys are lowercase SA names for case-insensitive lookup.
 */
export type SaMechanismMap = Map<string, string>;

/**
 * Builds a searchable text representation of a BDF product.
 * Structured to optimize semantic search for queries like:
 * - Product names
 * - Active substances (sostanze attive)
 * - Mechanism of action (coprente/sistemico/citotropico)
 * - Biological/organic flag
 * - Availability status
 */
export function buildBdfProductText(product: BdfProdotto, saMechanismMap?: SaMechanismMap): string {
  const lines: string[] = [];

  lines.push(`Prodotto: ${product.NOME_COMMERCIALE}`);

  const sa = [product.SA1, product.SA2, product.SA3].filter(Boolean) as string[];
  if (sa.length > 0) {
    lines.push(`Sostanze attive: ${sa.join(', ')}`);
  }

  const mechanisms = lookupMechanisms(sa, saMechanismMap);
  if (mechanisms.length > 0) {
    lines.push(`Meccanismo d'azione: ${mechanisms.join(', ')}`);
  }

  lines.push(`Biologico: ${product.BIO ? 'Sì' : 'No'}`);
  lines.push(`In vendita: ${product.IN_VENDITA ? 'Sì' : 'No'}`);

  if (product.REVOCATO) {
    lines.push('Stato: Revocato');
  }
  if (product.SCORTE) {
    lines.push('Disponibile fino esaurimento scorte');
  }

  lines.push(`Numero registrazione: ${product.NUM_REG}`);

  return lines.join(' | ');
}

/**
 * Extracts metadata from a BDF product for filtering and display.
 */
export function extractBdfProductMetadata(
  product: BdfProdotto,
  saMechanismMap?: SaMechanismMap,
): BdfProductMetadata {
  const sa = [product.SA1, product.SA2, product.SA3].filter(Boolean) as string[];
  const mechanisms = lookupMechanisms(sa, saMechanismMap);

  return {
    codice: product.COD_PRODOTTO,
    nome: product.NOME_COMMERCIALE,
    bio: product.BIO,
    inVendita: product.IN_VENDITA,
    sostanzeAttive: sa,
    meccanismoAzione: mechanisms.length > 0 ? mechanisms : undefined,
    revocato: product.REVOCATO,
    scorte: product.SCORTE,
    numRegistrazione: product.NUM_REG,
  };
}

/**
 * Converts a BdfProdotto to a BdfProductDocument ready for vector indexing.
 */
export function buildBdfProductDocument(
  product: BdfProdotto,
  saMechanismMap?: SaMechanismMap,
): BdfProductDocument {
  return {
    content: buildBdfProductText(product, saMechanismMap),
    metadata: extractBdfProductMetadata(product, saMechanismMap),
  };
}

/**
 * Looks up mechanism of action for a list of SA names.
 * Returns unique, non-null mechanisms.
 */
function lookupMechanisms(saNames: string[], map?: SaMechanismMap): string[] {
  if (!map || map.size === 0) return [];

  const mechanisms = new Set<string>();
  for (const name of saNames) {
    const mechanism = map.get(name.toLowerCase());
    if (mechanism) mechanisms.add(mechanism);
  }
  return Array.from(mechanisms);
}
