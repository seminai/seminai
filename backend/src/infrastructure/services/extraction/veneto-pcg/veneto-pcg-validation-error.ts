import type { VenetoPcgDiagnostics } from './veneto-pcg-types';

export class VenetoPcgValidationError extends Error {
  constructor(
    message: string,
    public readonly diagnostics: VenetoPcgDiagnostics,
  ) {
    super(message);
    this.name = 'VenetoPcgValidationError';
  }
}
