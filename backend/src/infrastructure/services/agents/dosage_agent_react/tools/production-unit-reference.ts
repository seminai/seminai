export const PRODUCTION_UNIT_UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INVALID_PRODUCTION_UNIT_REFERENCE_CODE = 'INVALID_PRODUCTION_UNIT_REFERENCE';

export const INVALID_PRODUCTION_UNIT_REFERENCE_MESSAGE =
  'Piano generato con riferimento unita produttiva non valido; rigenera il piano dopo aver selezionato una unita produttiva reale.';

export const INVALID_PRODUCTION_UNIT_REFERENCE_HINT =
  'Esegui list_production_units e usa una delle unita selezionabili restituite dal tool. Non usare il nome coltura come riferimento tecnico.';

export function isProductionUnitUuid(value: unknown): value is string {
  return typeof value === 'string' && PRODUCTION_UNIT_UUID_REGEX.test(value.trim());
}

export function collectInvalidProductionUnitIds(ids: readonly unknown[]): string[] {
  return [
    ...new Set(
      ids
        .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
        .map((id) => id.trim())
        .filter((id) => !isProductionUnitUuid(id)),
    ),
  ];
}

export function invalidProductionUnitReferenceResult(
  invalidUnitIds: readonly string[],
  options: { readonly message?: string; readonly hint?: string; readonly reason?: string } = {},
): string {
  return JSON.stringify({
    error: options.message ?? INVALID_PRODUCTION_UNIT_REFERENCE_MESSAGE,
    code: INVALID_PRODUCTION_UNIT_REFERENCE_CODE,
    blocked: true,
    invalidUnitCount: invalidUnitIds.length,
    ...(options.reason ? { reason: options.reason } : {}),
    hint: options.hint ?? INVALID_PRODUCTION_UNIT_REFERENCE_HINT,
  });
}
