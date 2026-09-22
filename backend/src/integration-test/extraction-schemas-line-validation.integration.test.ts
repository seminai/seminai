import { getExtractionSchema } from '../domain/extraction-schemas';

/**
 * Integration test for the LineSchema value-validation hardening.
 *
 * Bug (before fix): LineSchema accepted `quantity` and `unitPrice` as any number,
 * including negatives. A user could submit a chat-extracted DDT/FATTURA with
 * `quantity: -10` or `unitPrice: -3.5` and the commit would silently archive
 * garbage values that downstream stock/cost reports would aggregate as if real.
 *
 * Fix: both DDT and FATTURA LineSchema now constrain `quantity` and `unitPrice`
 * with `.nonnegative()`, and `productName` with `.min(1)` (empty string rejected,
 * undefined still allowed by `.partial()`). Zero is intentionally permitted to
 * cover free samples ("omaggio").
 *
 * The test calls the real Zod schema (same one used at the commit endpoint via
 * `getExtractionSchema(category).zodSchema.safeParse(...)`).
 */
jest.setTimeout(15_000);

const VALID_FATTURA_BASE = {
  invoiceNumber: 'FT-001',
  invoiceDate: '2026-01-15',
  supplierName: 'Fornitore SRL',
};

const VALID_DDT_BASE = {
  ddtNumber: 'DDT-001',
  ddtDate: '2026-01-15',
  supplierName: 'Fornitore SRL',
};

function pathContainsLineField(issuePath: ReadonlyArray<unknown>, field: string): boolean {
  return issuePath.includes('lines') && issuePath.includes(field);
}

describe.each([
  ['FATTURA' as const, VALID_FATTURA_BASE],
  ['DDT' as const, VALID_DDT_BASE],
])('%s LineSchema value validation', (category, base) => {
  const schema = getExtractionSchema(category).zodSchema;

  it('accepts a fully-valid payload with positive quantity and unitPrice', () => {
    const result = schema.safeParse({
      ...base,
      lines: [{ productName: 'UREA 46%', quantity: 100, unitOfMeasure: 'KG', unitPrice: 0.8 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts zero quantity and zero unitPrice (free samples)', () => {
    const result = schema.safeParse({
      ...base,
      lines: [{ productName: 'CAMPIONE OMAGGIO', quantity: 0, unitOfMeasure: 'PZ', unitPrice: 0 }],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a negative quantity with a clear path pointing at the offending line/field', () => {
    const result = schema.safeParse({
      ...base,
      lines: [{ productName: 'X', quantity: -10, unitOfMeasure: 'KG', unitPrice: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const offending = result.error.issues.find((i) => pathContainsLineField(i.path, 'quantity'));
      expect(offending).toBeDefined();
    }
  });

  it('rejects a negative unitPrice', () => {
    const result = schema.safeParse({
      ...base,
      lines: [{ productName: 'X', quantity: 1, unitOfMeasure: 'KG', unitPrice: -3.5 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const offending = result.error.issues.find((i) => pathContainsLineField(i.path, 'unitPrice'));
      expect(offending).toBeDefined();
    }
  });

  it('rejects an empty productName string (typo / cleared field)', () => {
    const result = schema.safeParse({
      ...base,
      lines: [{ productName: '', quantity: 1, unitOfMeasure: 'KG', unitPrice: 1 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const offending = result.error.issues.find((i) =>
        pathContainsLineField(i.path, 'productName'),
      );
      expect(offending).toBeDefined();
    }
  });

  it('allows omitting productName entirely (undefined is fine under .partial())', () => {
    const result = schema.safeParse({
      ...base,
      lines: [{ quantity: 1, unitOfMeasure: 'KG', unitPrice: 1 }],
    });
    expect(result.success).toBe(true);
  });

  it('reports issues for every invalid line in a multi-line payload', () => {
    const result = schema.safeParse({
      ...base,
      lines: [
        { productName: 'A', quantity: 1, unitOfMeasure: 'KG', unitPrice: 1 },
        { productName: 'B', quantity: -2, unitOfMeasure: 'KG', unitPrice: 1 },
        { productName: 'C', quantity: 1, unitOfMeasure: 'KG', unitPrice: -1 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const negatives = result.error.issues.filter(
        (i) =>
          pathContainsLineField(i.path, 'quantity') || pathContainsLineField(i.path, 'unitPrice'),
      );
      expect(negatives.length).toBeGreaterThanOrEqual(2);
    }
  });
});
