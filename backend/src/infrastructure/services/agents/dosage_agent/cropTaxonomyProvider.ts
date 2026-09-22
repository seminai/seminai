import { readFileSync } from 'fs';
import * as path from 'path';

interface CropTaxonomyRow {
  readonly agronomicCategory: string;
  readonly commonName: string;
  readonly className: string;
  readonly order: string;
  readonly family: string;
  readonly genus: string;
  readonly species: string;
  readonly searchTokens: ReadonlyArray<string>;
}

export interface CropTaxonomyContext {
  readonly agronomicCategory: string;
  readonly commonName: string;
  readonly className: string;
  readonly order: string;
  readonly family: string;
  readonly genus: string;
  readonly species: string;
}

const DATASET_PATH: string = path.resolve(process.cwd(), 'dataset/crop_family/crop-families.csv');

let cachedRows: ReadonlyArray<CropTaxonomyRow> | null = null;

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function toSearchTokens(values: ReadonlyArray<string>): ReadonlyArray<string> {
  const tokens = new Set<string>();
  values.forEach((value) => {
    const normalized = normalizeText(value);
    if (!normalized) {
      return;
    }
    tokens.add(normalized);
    normalized
      .split(' ')
      .filter((token) => token.length >= 3)
      .forEach((token) => tokens.add(token));
  });
  return Array.from(tokens);
}

function parseCsvLine(line: string): ReadonlyArray<string> {
  const stripped = line.trim().replace(/^"|"$/g, '');
  if (!stripped) {
    return [];
  }
  return stripped.split('","').map((cell) => cell.replace(/""/g, '"').trim());
}

function loadDataset(): ReadonlyArray<CropTaxonomyRow> {
  if (cachedRows) {
    return cachedRows;
  }
  const fileContent = readFileSync(DATASET_PATH, { encoding: 'utf-8' });
  const lines = fileContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length <= 1) {
    cachedRows = [];
    return cachedRows;
  }
  const [, ...dataLines] = lines;
  cachedRows = dataLines
    .map((line) => parseCsvLine(line))
    .filter((cells) => cells.length >= 7)
    .map((cells) => {
      const [agronomicCategory, commonName, className, order, family, genus, species] = cells;
      const searchTokens = toSearchTokens([agronomicCategory, commonName, family, genus, species]);
      return {
        agronomicCategory,
        commonName,
        className,
        order,
        family,
        genus,
        species,
        searchTokens,
      };
    });
  return cachedRows;
}

function buildTargetTokens(cropName: string, variety?: string): ReadonlyArray<string> {
  const values = [cropName, variety ?? ''].filter((value) => Boolean(value)) as string[];
  return toSearchTokens(values);
}

interface ScoredMatch {
  readonly row: CropTaxonomyRow;
  readonly score: number;
  readonly matchedTokens: ReadonlyArray<string>;
}

function calculateMatchScore(
  rowTokens: ReadonlyArray<string>,
  targetTokens: ReadonlyArray<string>,
): { score: number; matchedTokens: ReadonlyArray<string> } {
  const matched: string[] = [];
  let score = 0;

  for (const token of targetTokens) {
    if (rowTokens.includes(token)) {
      matched.push(token);
      // Longer tokens get higher scores (more specific matches)
      score += token.length;
    }
  }

  // Bonus for matching multiple tokens (indicates more complete match)
  if (matched.length > 1) {
    score += matched.length * 5;
  }

  return { score, matchedTokens: matched };
}

export function findCropTaxonomyContext(
  cropName: string,
  variety?: string,
): CropTaxonomyContext | null {
  const tokens = buildTargetTokens(cropName, variety);
  if (tokens.length === 0) {
    return null;
  }
  const rows = loadDataset();

  // Find all matching rows with their scores
  const scoredMatches: ScoredMatch[] = [];
  for (const row of rows) {
    const { score, matchedTokens } = calculateMatchScore(row.searchTokens, tokens);
    if (score > 0) {
      scoredMatches.push({ row, score, matchedTokens });
    }
  }

  if (scoredMatches.length === 0) {
    return null;
  }

  // Sort by score descending and pick the best match
  scoredMatches.sort((a, b) => b.score - a.score);
  const bestMatch = scoredMatches[0];

  // Debug logging for troubleshooting
  if (scoredMatches.length > 1) {
    console.log(
      `[CROP-TAXONOMY] Best match for "${cropName}/${variety}": ${bestMatch.row.commonName} (score: ${bestMatch.score}, tokens: ${bestMatch.matchedTokens.join(', ')})`,
    );
  }

  return {
    agronomicCategory: bestMatch.row.agronomicCategory,
    commonName: bestMatch.row.commonName,
    className: bestMatch.row.className,
    order: bestMatch.row.order,
    family: bestMatch.row.family,
    genus: bestMatch.row.genus,
    species: bestMatch.row.species,
  };
}
