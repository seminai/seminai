import proj4 from 'proj4';
import {
  isNonAgriculturalUse,
  parseVenetoDate,
} from './agents/file_agent/template/veneto_file_structure';

proj4.defs('EPSG:32632', '+proj=utm +zone=32 +datum=WGS84 +units=m +no_defs +type=crs');

export interface ParsedPcgParticelle {
  readonly comune: string;
  readonly foglio: string;
  readonly particella: string;
}

export interface ParsedPcgCropLabel {
  readonly cropType: string;
  readonly cropName: string;
  readonly uso: string;
}

const PARTICELLE_RE = /^(.+?)\s+FG\s+(\d+)\s+PT\s+([\d,]+)$/i;

export function convertUtm32ToWgs84(x: number, y: number): [number, number] {
  const [lon, lat] = proj4('EPSG:32632', 'EPSG:4326', [x, y]);
  return [lon, lat];
}

export function convertRingUtm32ToWgs84(ring: readonly number[][]): number[][] {
  return ring.map(([x, y]) => {
    const [lon, lat] = convertUtm32ToWgs84(x, y);
    return [lon, lat];
  });
}

export function computeRingCentroid(ring: readonly number[][]): [number, number] {
  if (ring.length === 0) return [0, 0];
  const sumX = ring.reduce((acc, pt) => acc + pt[0], 0);
  const sumY = ring.reduce((acc, pt) => acc + pt[1], 0);
  return [sumX / ring.length, sumY / ring.length];
}

export function normalizeParticellaNumber(value: string): string {
  const trimmed = value.trim();
  const normalized = trimmed.replace(/^0+/, '');
  return normalized.length > 0 ? normalized : trimmed;
}

export function parsePcgParticelles(raw: string | undefined | null): ParsedPcgParticelle | null {
  if (!raw) return null;
  const match = raw.trim().match(PARTICELLE_RE);
  if (!match) return null;
  const firstParticella = match[3].split(',')[0]?.trim() ?? match[3].trim();
  return {
    comune: match[1].trim(),
    foglio: match[2].trim(),
    particella: normalizeParticellaNumber(firstParticella),
  };
}

export function parsePcgCropLabel(
  coltura: string | undefined | null,
  codColtura: string | undefined | null,
): ParsedPcgCropLabel {
  const cropType = (codColtura?.split('-')[0] ?? '').trim();
  const raw = coltura?.trim() ?? '';
  const uso = raw || '';
  const withoutMetadataSuffix = stripPcgCropMetadataSuffix(raw);
  const hierarchicalSegments = withoutMetadataSuffix
    .split(/(?<!\s)-(?!\s)/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
  const cropName =
    hierarchicalSegments.length > 1
      ? hierarchicalSegments[hierarchicalSegments.length - 1]
      : withoutMetadataSuffix || raw;
  return { cropType, cropName, uso };
}

function stripPcgCropMetadataSuffix(coltura: string): string {
  return coltura.replace(/\s+-\s+(permanente|temporaneo)$/i, '').trim();
}

export function parsePcgDate(value: string | undefined | null): string | null {
  if (!value) return null;
  return parseVenetoDate(value);
}

export function isProductivePcgColtura(coltura: string | undefined | null): boolean {
  if (!coltura) return false;
  if (isNonAgriculturalUse(coltura)) return false;
  const upper = coltura.toUpperCase();
  if (upper.startsWith('BOSCO') || upper.includes('-BOSCO')) return false;
  return true;
}

export function buildPcgFieldName(
  comune: string | null,
  foglio: string | null,
  particella: string | null,
): string {
  if (comune && foglio && particella) {
    return `${comune} - F${foglio} P${particella}`;
  }
  if (comune) return comune;
  return 'Campo PCG';
}
