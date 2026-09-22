import { AppError } from '../../domain/errors/AppError';

/** Returns a configured secret or raises the standard optional-feature error. */
export function requireConfiguredFeature(feature: string, value: string | undefined): string {
  if (!value) {
    throw AppError.featureNotConfigured(feature);
  }
  return value;
}
