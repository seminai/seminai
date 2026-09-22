import { OcrRowReviewService } from '../../infrastructure/services/extraction/ocr-row-review-service';
import { type NormalizedTable } from '../../infrastructure/services/extraction/table-normalizer';

interface TestEntry {
  readonly productName: string;
  readonly quantity: number | null;
  readonly quantityUnitOfMeasure: string | null;
  readonly unitPrice: number | null;
  readonly totalPrice: number | null;
  readonly needsReview?: boolean;
  readonly reviewReasons?: readonly string[];
  readonly sourceRowIndex?: number;
  readonly productCode?: string | null;
  readonly rawLine?: string;
  readonly sourceChannel?: 'llm-primary' | 'deterministic-fallback' | 'xml';
}

describe('OcrRowReviewService', () => {
  it('attaches source metadata from matching OCR table rows', () => {
    const actualEntries = OcrRowReviewService.apply({
      entries: [createEntry({ productName: 'SERCADIS SC 1 L' })],
      tables: [createTable()],
      channel: 'llm-primary',
    });
    expect(actualEntries[0]).toMatchObject({
      sourceRowIndex: 0,
      productCode: 'XSER030S',
      rawLine: 'XSER030S | SERCADIS SC 1 L | 4 | PZ | 120,00 | 480,00',
      sourceChannel: 'llm-primary',
    });
  });

  it('flags product code and name mismatches as likely row shifts', () => {
    const actualEntries = OcrRowReviewService.apply({
      entries: [createEntry({ productName: 'SCHERMO 0.5G KG.10' })],
      tables: [createTable()],
      channel: 'llm-primary',
    });
    expect(actualEntries[0].needsReview).toBe(true);
    expect(actualEntries[0].reviewReasons?.join(' ')).toContain('Product code/name mismatch');
  });

  it('flags large row count differences for primary LLM extraction', () => {
    const table = createTable();
    const actualEntries = OcrRowReviewService.apply({
      entries: [createEntry()],
      tables: [{ ...table, rows: [table.rows[0], table.rows[0], table.rows[0], table.rows[0]] }],
      channel: 'llm-primary',
    });
    expect(actualEntries[0].needsReview).toBe(true);
    expect(actualEntries[0].reviewReasons?.join(' ')).toContain('row count differs');
  });
});

function createEntry(overrides: Partial<TestEntry> = {}): TestEntry {
  return {
    productName: 'SERCADIS SC 1 L',
    quantity: 4,
    quantityUnitOfMeasure: 'PZ',
    unitPrice: 120,
    totalPrice: 480,
    ...overrides,
  };
}

function createTable(): NormalizedTable {
  return {
    headers: ['Codice', 'Descrizione', 'Qta', 'UM', 'Prezzo', 'Totale'],
    rows: [
      {
        productName: 'SERCADIS SC 1 L',
        productCode: 'XSER030S',
        quantity: 4,
        quantityUnitOfMeasure: 'PZ',
        unitPrice: 120,
        totalPrice: 480,
        rawLine: 'XSER030S | SERCADIS SC 1 L | 4 | PZ | 120,00 | 480,00',
      },
    ],
  };
}
