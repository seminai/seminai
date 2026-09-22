/**
 * Deterministic resolver: given the label dose rows and a target crop
 * (plus optional adversity/epoca), picks the best-matching row and reports a
 * confidence score. Replaces the bidirectional substring matching used in the
 * legacy dose flow, which silently matched the wrong crop.
 *
 * Pure and synchronous so it is trivially unit-testable.
 */

export interface DoseRowLike {
  readonly coltura: string;
  readonly malattia?: string | null;
  readonly epoca_impiego?: string | null;
}

export interface ResolveDoseRowParams {
  readonly rows: ReadonlyArray<DoseRowLike>;
  readonly cropName: string;
  readonly adversity?: string | null;
  readonly epoca?: string | null;
}

export interface DoseRowMatch {
  readonly index: number;
  readonly confidence: number;
}

/** Crop scores below this never produce a match. */
const MIN_CROP_SCORE = 0.4;

export function resolveDoseRow(params: ResolveDoseRowParams): DoseRowMatch | null {
  const target = normalize(params.cropName);
  if (!target || params.rows.length === 0) return null;
  let best: DoseRowMatch | null = null;
  params.rows.forEach((row, index) => {
    const score = scoreRow(row, target, params.adversity, params.epoca);
    if (score <= 0) return;
    if (!best || score > best.confidence) {
      best = { index, confidence: score };
    }
  });
  return best;
}

function scoreRow(
  row: DoseRowLike,
  target: string,
  adversity?: string | null,
  epoca?: string | null,
): number {
  const cropScore = scoreCrop(row.coltura, target);
  if (cropScore < MIN_CROP_SCORE) return 0;
  const bonus = adversityBonus(row.malattia, adversity) + epocaBonus(row.epoca_impiego, epoca);
  return clamp01(cropScore + bonus);
}

function scoreCrop(rowCrop: string, target: string): number {
  const a = normalize(rowCrop);
  if (!a) return 0;
  if (a === target) return 1;
  const ta = tokenSet(a);
  const tb = tokenSet(target);
  if (isSubset(ta, tb) || isSubset(tb, ta)) return 0.85;
  const overlap = jaccard(ta, tb);
  return overlap > 0 ? 0.4 + 0.4 * overlap : 0;
}

function adversityBonus(rowDisease?: string | null, adversity?: string | null): number {
  if (!adversity || !rowDisease) return 0;
  const a = normalize(rowDisease);
  const b = normalize(adversity);
  if (!a || !b) return 0;
  if (a === b || isSubset(tokenSet(a), tokenSet(b)) || isSubset(tokenSet(b), tokenSet(a))) {
    return 0.1;
  }
  return -0.15;
}

function epocaBonus(rowEpoca?: string | null, epoca?: string | null): number {
  if (!epoca || !rowEpoca) return 0;
  const overlap = jaccard(tokenSet(normalize(rowEpoca)), tokenSet(normalize(epoca)));
  return overlap > 0 ? 0.05 : 0;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function tokenSet(value: string): ReadonlySet<string> {
  return new Set(value.split(' ').filter(Boolean));
}

function isSubset(small: ReadonlySet<string>, large: ReadonlySet<string>): boolean {
  if (small.size === 0) return false;
  for (const token of small) {
    if (!large.has(token)) return false;
  }
  return true;
}

function jaccard(a: ReadonlySet<string>, b: ReadonlySet<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
