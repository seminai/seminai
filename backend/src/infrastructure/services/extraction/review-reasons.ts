interface ReviewableEntry {
  readonly needsReview?: boolean;
  readonly reviewReasons?: readonly string[];
}

/**
 * Adds review reasons without losing reasons already attached by another pass.
 */
export function withReviewReasons<T extends ReviewableEntry>(
  entry: T,
  reasons: readonly string[],
): T {
  if (reasons.length === 0) return entry;
  const merged = new Set([...(entry.reviewReasons ?? []), ...reasons]);
  return { ...entry, needsReview: true, reviewReasons: Array.from(merged) };
}
