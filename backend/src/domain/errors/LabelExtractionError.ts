/**
 * Thrown when structured label extraction fails after all retry attempts.
 * Callers should treat the extraction as definitively failed and avoid
 * persisting an empty label to the cache.
 */
export class LabelExtractionError extends Error {
  constructor(
    message: string,
    public readonly cause?: Error,
  ) {
    super(message);
    this.name = 'LabelExtractionError';
    Object.setPrototypeOf(this, LabelExtractionError.prototype);
  }
}
