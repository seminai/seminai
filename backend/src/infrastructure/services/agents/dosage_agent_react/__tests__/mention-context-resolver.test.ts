const mockPrisma = {
  company: { findFirst: jest.fn() },
  product: { findFirst: jest.fn() },
  field: { findFirst: jest.fn() },
  productionUnit: { findFirst: jest.fn() },
  stock: { findFirst: jest.fn() },
  file: { findFirst: jest.fn() },
};

const mockResolveMentionAccessReason = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({
  prisma: mockPrisma,
}));

jest.mock('../mention-access-reason-resolver', () => ({
  resolveMentionAccessReason: (...args: unknown[]) => mockResolveMentionAccessReason(...args),
}));

import {
  resolveMentionContext,
  _resetMentionResolverCacheForTesting,
} from '../mention-context-resolver';

describe('mention-context-resolver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    _resetMentionResolverCacheForTesting();
  });

  it('builds context for a resolved company mention', async () => {
    mockPrisma.company.findFirst.mockResolvedValue({
      name: 'Azienda Test',
      vatNumber: 'IT123',
      city: 'Padova',
      _count: { fields: 2, warehouses: 1 },
    });

    const result = await resolveMentionContext({
      userId: 'user-1',
      mentions: [{ type: 'company', id: 'comp-1', label: 'Azienda Test' }],
    });

    expect(result.unresolved).toHaveLength(0);
    expect(result.context).toContain('Azienda: Azienda Test');
    expect(result.context).toContain('list_user_companies');
  });

  it('returns unresolved reason when mention is not authorized', async () => {
    mockPrisma.company.findFirst.mockResolvedValue(null);
    mockResolveMentionAccessReason.mockResolvedValue('not_authorized');

    const result = await resolveMentionContext({
      userId: 'user-1',
      mentions: [{ type: 'company', id: 'comp-denied', label: 'Denied Company' }],
    });

    expect(result.context).toBe('');
    expect(result.unresolved).toEqual([
      {
        type: 'company',
        id: 'comp-denied',
        label: 'Denied Company',
        reason: 'not_authorized',
      },
    ]);
  });

  it('uses persisted extraction context for file mentions', async () => {
    mockPrisma.file.findFirst.mockResolvedValue({
      name: 'doc.pdf',
      url: 'https://example.com/doc.pdf',
      type: 'application/pdf',
      metadata: { mimeType: 'application/pdf' },
      company: { name: 'Azienda Test' },
      extractions: [
        {
          category: 'ddt',
          status: 'PENDING_CONFIRMATION',
          updatedAt: new Date('2026-04-11T12:34:55.950Z'),
          extractedData: {
            entries: [
              {
                supplierName: 'CONSORZIO AGRARIO CREMONA',
                supplierVat: 'IT00114930191',
                invoiceNumber: 'AN/0000152',
                invoiceDate: '2026-02-04',
                productName: 'CONCIME NAXOS',
              },
            ],
          },
        },
      ],
    });

    const result = await resolveMentionContext({
      userId: 'user-1',
      mentions: [{ type: 'file', id: 'file-1', label: 'doc.pdf' }],
    });

    expect(result.unresolved).toHaveLength(0);
    expect(result.context).toContain('Documento: doc.pdf');
    expect(result.context).toContain('Fornitore: CONSORZIO AGRARIO CREMONA');
  });

  it('adds extract_from_file hint only when upload exists in working memory', async () => {
    mockPrisma.file.findFirst.mockResolvedValue({
      name: 'doc.jpg',
      url: 'https://example.com/doc.jpg',
      type: 'image/jpeg',
      metadata: null,
      company: { name: 'Azienda Test' },
      extractions: [],
    });

    const withoutUpload = await resolveMentionContext({
      userId: 'user-1',
      mentions: [{ type: 'file', id: 'file-1', label: 'doc.jpg' }],
      hasUploadedFilesInWorkingMemory: false,
    });
    const withUpload = await resolveMentionContext({
      userId: 'user-1',
      mentions: [{ type: 'file', id: 'file-1', label: 'doc.jpg' }],
      hasUploadedFilesInWorkingMemory: true,
    });

    expect(withoutUpload.context).not.toContain('extract_from_file');
    expect(withUpload.context).toContain('extract_from_file');
  });

  // ── PR-H: dedup + parallel + cache ──

  it('dedupes mentions by (type, id) — single Prisma call for duplicates', async () => {
    mockPrisma.company.findFirst.mockResolvedValue({
      name: 'Azienda Test',
      vatNumber: 'IT123',
      city: 'Padova',
      _count: { fields: 0, warehouses: 0 },
    });

    const dup = { type: 'company' as const, id: 'comp-dup', label: 'Azienda Test' };
    const result = await resolveMentionContext({
      userId: 'user-1',
      mentions: [dup, dup, dup],
    });

    expect(mockPrisma.company.findFirst).toHaveBeenCalledTimes(1);
    const occurrences = result.context.match(/Azienda: Azienda Test/g) ?? [];
    expect(occurrences).toHaveLength(1);
  });

  it('runs lookups in parallel — concurrent mentions complete within ~one Prisma timeout', async () => {
    const DELAY_MS = 80;
    const minimalCompany = {
      name: 'C',
      vatNumber: 'V',
      city: 'X',
      _count: { fields: 0, warehouses: 0 },
    };
    const minimalProduct = {
      name: 'P',
      category: 'PESTICIDE',
      registrationNumber: 'R',
      warehouse: { company: { name: 'C' } },
      stocks: [],
    };
    const minimalField = {
      name: 'F',
      sauHa: 1,
      city: 'X',
      foglio: null,
      particella: null,
      company: { name: 'C' },
      productionUnitsOnFields: [],
    };
    const minimalPU = {
      name: 'PU',
      areaHa: 1,
      cycles: [],
      productionUnitsOnFields: [],
    };
    const minimalStock = {
      quantity: 1,
      unitOfMeasureQuantity: 'kg',
      price: 1,
      unitOfMeasurePrice: 'EUR',
      companySupplierName: null,
      product: { name: 'P', warehouse: { company: { name: 'C' } } },
    };

    mockPrisma.company.findFirst.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(minimalCompany), DELAY_MS)),
    );
    mockPrisma.product.findFirst.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(minimalProduct), DELAY_MS)),
    );
    mockPrisma.field.findFirst.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(minimalField), DELAY_MS)),
    );
    mockPrisma.productionUnit.findFirst.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(minimalPU), DELAY_MS)),
    );
    mockPrisma.stock.findFirst.mockImplementation(
      () => new Promise((r) => setTimeout(() => r(minimalStock), DELAY_MS)),
    );

    const start = Date.now();
    await resolveMentionContext({
      userId: 'user-1',
      mentions: [
        { type: 'company', id: 'c1', label: 'a' },
        { type: 'product', id: 'p1', label: 'b' },
        { type: 'field', id: 'f1', label: 'c' },
        { type: 'production_unit', id: 'pu1', label: 'd' },
        { type: 'stock', id: 's1', label: 'e' },
      ],
    });
    const elapsed = Date.now() - start;

    // Sequential would be 5 × 80ms = 400ms. Parallel should be ~80-200ms.
    expect(elapsed).toBeLessThan(300);
  });

  it('preserves the original mention order in the context output', async () => {
    mockPrisma.field.findFirst.mockResolvedValue({
      name: 'CampoX',
      sauHa: 1,
      city: 'X',
      foglio: null,
      particella: null,
      company: { name: 'C' },
      productionUnitsOnFields: [],
    });
    mockPrisma.product.findFirst.mockResolvedValue({
      name: 'ProdY',
      category: 'PESTICIDE',
      registrationNumber: 'R',
      warehouse: { company: { name: 'C' } },
      stocks: [],
    });
    mockPrisma.company.findFirst.mockResolvedValue({
      name: 'AziendaZ',
      vatNumber: 'V',
      city: 'X',
      _count: { fields: 0, warehouses: 0 },
    });

    const result = await resolveMentionContext({
      userId: 'user-1',
      mentions: [
        { type: 'field', id: 'f1', label: 'CampoX' },
        { type: 'product', id: 'p1', label: 'ProdY' },
        { type: 'company', id: 'c1', label: 'AziendaZ' },
      ],
    });

    const idxField = result.context.indexOf('Campo: CampoX');
    const idxProduct = result.context.indexOf('Prodotto: ProdY');
    const idxCompany = result.context.indexOf('Azienda: AziendaZ');

    expect(idxField).toBeGreaterThanOrEqual(0);
    expect(idxProduct).toBeGreaterThan(idxField);
    expect(idxCompany).toBeGreaterThan(idxProduct);
  });
});
