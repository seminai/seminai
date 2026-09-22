/**
 * Raised when a weather-aware operation is attempted on a Field that has no
 * latitude/longitude. Tools should catch this and return a structured,
 * human-readable message to the LLM rather than rethrow.
 */
export class FieldMissingCoordinatesError extends Error {
  constructor(public readonly fieldId: string) {
    super(`Field ${fieldId} is missing latitude/longitude coordinates`);
    this.name = 'FieldMissingCoordinatesError';
    Object.setPrototypeOf(this, FieldMissingCoordinatesError.prototype);
  }
}
