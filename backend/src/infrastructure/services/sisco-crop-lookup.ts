/**
 * SISCO crop lookup for PCG extractions.
 *
 * We temporarily use `dataset/sisco_lombardia/lombardia_sisco_utilizzi_2025.csv` as the
 * national SIAN/SISCO catalog for Veneto PCG crop codes as well. Veneto PCG exports use
 * the same OCCU-DEST-USO-QUAL structure (with an optional fifth detail segment) and the
 * codes match this file. Replace SISCO_CATALOG_PATH when a dedicated Veneto export exists.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { ParsedPcgCropLabel } from './pcg-geojson-utils';
import { parsePcgCropLabel } from './pcg-geojson-utils';

const SISCO_CATALOG_PATH = path.resolve(
  process.cwd(),
  'dataset/sisco_lombardia/lombardia_sisco_utilizzi_2025.csv',
);

export interface SiscoCropEntry {
  readonly cropName: string;
  readonly cropType: string;
  readonly uso: string;
}

const SISCO_CODE_RE = /^(\d{3})-(\d{3})-(\d{3})-(\d{3})(?:-(\d{3}))?$/;

let catalogCache: ReadonlyMap<string, SiscoCropEntry> | null = null;

export function parseSiscoUtilizzoCode(codColtura: string | undefined | null): string | null {
  if (!codColtura) return null;
  const match = codColtura.trim().match(SISCO_CODE_RE);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}-${match[4]}`;
}

export function loadSiscoCropCatalog(): ReadonlyMap<string, SiscoCropEntry> {
  if (catalogCache) return catalogCache;

  const content = fs.readFileSync(SISCO_CATALOG_PATH, 'utf8');
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
  const catalog = new Map<string, SiscoCropEntry>();

  for (let index = 1; index < lines.length; index += 1) {
    const columns = lines[index].split(';');
    if (columns.length < 12) continue;

    const codOccupazione = columns[4]?.trim() ?? '';
    const codDestinazione = columns[5]?.trim() ?? '';
    const codUso = columns[6]?.trim() ?? '';
    const codQualita = columns[7]?.trim() ?? '';
    if (!codOccupazione || !codDestinazione || !codUso || !codQualita) continue;

    const key = `${codOccupazione}-${codDestinazione}-${codUso}-${codQualita}`;
    if (catalog.has(key)) continue;

    const desProdotto = columns[1]?.trim() ?? '';
    const descOccu = columns[8]?.trim() ?? '';
    const destUso = columns[9]?.trim() ?? '';
    const descUso = columns[10]?.trim() ?? '';
    const descQual = columns[11]?.trim() ?? '';

    catalog.set(key, {
      cropName: desProdotto || descOccu,
      cropType: codOccupazione,
      uso: buildSiscoUsoDescription(destUso, descUso, descQual),
    });
  }

  catalogCache = catalog;
  return catalogCache;
}

export function lookupSiscoCrop(codColtura: string | undefined | null): SiscoCropEntry | null {
  const key = parseSiscoUtilizzoCode(codColtura);
  if (!key) return null;
  return loadSiscoCropCatalog().get(key) ?? null;
}

export function resolvePcgCropLabel(
  coltura: string | undefined | null,
  codColtura: string | undefined | null,
): ParsedPcgCropLabel {
  const lookup = lookupSiscoCrop(codColtura);
  if (lookup) {
    return {
      cropType: lookup.cropType,
      cropName: lookup.cropName,
      uso: lookup.uso || coltura?.trim() || lookup.cropName,
    };
  }
  return parsePcgCropLabel(coltura, codColtura);
}

function buildSiscoUsoDescription(destUso: string, descUso: string, descQual: string): string {
  const parts = [destUso, descUso, descQual].filter((part) => part.length > 0);
  return parts.join(' - ');
}

/** Resets the in-memory catalog cache (for tests). */
export function resetSiscoCropCatalogCache(): void {
  catalogCache = null;
}
