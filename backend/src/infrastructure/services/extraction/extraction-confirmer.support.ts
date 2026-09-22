export interface ConfirmResult {
  readonly extractionId: string;
  readonly category: string;
  readonly status: 'CONFIRMED';
  readonly summary: Record<string, unknown>;
}
