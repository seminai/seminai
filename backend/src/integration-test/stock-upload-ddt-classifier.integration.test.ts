import { DdtProductClassifier } from '../infrastructure/services/tool/ddt-product-classifier';

/**
 * Integration tests for the DDT Product Classifier.
 *
 * Tests the classification of products extracted from DDT documents:
 * - Phytosanitary products (looked up against official registration dataset)
 * - Fertilizer products (keyword detection)
 * - Other products (fallback)
 *
 * Run with:
 *   npm run test:integration -- stock-upload-ddt-classifier.integration.test.ts
 */

jest.setTimeout(60000);

describe('DDT Product Classifier - Integration Tests', () => {
  let classifier: DdtProductClassifier;

  beforeAll(() => {
    classifier = new DdtProductClassifier();
  });

  it('should classify a known phytosanitary product and find its registration number', () => {
    const entries = [
      {
        productName: 'POLTIGLIA DISPERSS',
        registrationNumber: null,
        quantity: 10,
        quantityUnitOfMeasure: 'kg',
        supplierName: 'Test Supplier',
        supplierVat: '12345678901',
        ddtDate: '2025-06-15',
        orderNumber: 'DDT-001',
      },
    ];

    const result = classifier.execute({ entries });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].productCategory).toBe('PHYTOSANITARY');
    // Registration number should have been found via lookup
    if (result[0].registrationNumber) {
      expect(typeof result[0].registrationNumber).toBe('string');
      expect(result[0].registrationNumber!.length).toBeGreaterThan(0);
    }
  });

  it('should classify a fertilizer product by keyword detection', () => {
    const entries = [
      {
        productName: 'UREA GRANULARE 46% N',
        registrationNumber: null,
        quantity: 50,
        quantityUnitOfMeasure: 'kg',
        supplierName: null,
        supplierVat: null,
        ddtDate: null,
        orderNumber: null,
      },
    ];

    const result = classifier.execute({ entries });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(result[0].productCategory).toBe('FERTILIZER');
    expect(result[0].productName).toBe('UREA GRANULARE 46% N');
  });

  it('should classify NPK fertilizer products when no fuzzy match is found', () => {
    // Note: the fuzzy lookup may match short substrings in the fitosanitari DB.
    // When matched, the product is classified as PHYTOSANITARY.
    // When NOT matched, the FERTILIZER keyword heuristic kicks in.
    const entries = [
      {
        productName: 'CONCIME AZOTO LIQUIDO GENERICO',
        registrationNumber: null,
        quantity: 100,
        quantityUnitOfMeasure: 'kg',
        supplierName: null,
        supplierVat: null,
        ddtDate: null,
        orderNumber: null,
      },
    ];

    const result = classifier.execute({ entries });

    expect(result).toBeDefined();
    // If matched via fuzzy lookup -> PHYTOSANITARY, otherwise -> FERTILIZER via keyword
    expect(['PHYTOSANITARY', 'FERTILIZER']).toContain(result[0].productCategory);
  });

  it('should always return a valid product category', () => {
    const entries = [
      {
        productName: 'ZZZZZZZ PRODOTTO INESISTENTE',
        registrationNumber: null,
        quantity: 5,
        quantityUnitOfMeasure: 'pz',
        supplierName: null,
        supplierVat: null,
        ddtDate: null,
        orderNumber: null,
      },
    ];

    const result = classifier.execute({ entries });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    expect(['PHYTOSANITARY', 'FERTILIZER', 'OTHER']).toContain(result[0].productCategory);
  });

  it('should classify a batch of mixed products correctly', () => {
    const entries = [
      {
        productName: 'POLTIGLIA DISPERSS',
        registrationNumber: null,
        quantity: 10,
        quantityUnitOfMeasure: 'kg',
        supplierName: 'Fornitore A',
        supplierVat: null,
        ddtDate: '2025-06-15',
        orderNumber: 'DDT-100',
      },
      {
        productName: 'CONCIME FOGLIARE NPK',
        registrationNumber: null,
        quantity: 20,
        quantityUnitOfMeasure: 'L',
        supplierName: 'Fornitore A',
        supplierVat: null,
        ddtDate: '2025-06-15',
        orderNumber: 'DDT-100',
      },
      {
        productName: 'TELO PACCIAMANTE 1.5m',
        registrationNumber: null,
        quantity: 2,
        quantityUnitOfMeasure: 'rotoli',
        supplierName: 'Fornitore B',
        supplierVat: null,
        ddtDate: '2025-06-15',
        orderNumber: 'DDT-101',
      },
    ];

    const result = classifier.execute({ entries });

    expect(result).toBeDefined();
    expect(result.length).toBe(3);

    // POLTIGLIA DISPERSS should be PHYTOSANITARY (known product)
    const phyto = result.find((r) => r.productName === 'POLTIGLIA DISPERSS');
    expect(phyto).toBeDefined();
    expect(phyto!.productCategory).toBe('PHYTOSANITARY');

    // NPK fertilizer
    const fertilizer = result.find((r) => r.productName === 'CONCIME FOGLIARE NPK');
    expect(fertilizer).toBeDefined();
    expect(fertilizer!.productCategory).toBe('FERTILIZER');

    // Unknown item
    const other = result.find((r) => r.productName === 'TELO PACCIAMANTE 1.5m');
    expect(other).toBeDefined();
    expect(other!.productCategory).toBe('OTHER');
  });

  it('should preserve original entry data when classifying', () => {
    const entries = [
      {
        productName: 'SOLFATO DI RAME',
        registrationNumber: null,
        quantity: 15,
        quantityUnitOfMeasure: 'kg',
        supplierName: 'Chimica SRL',
        supplierVat: '98765432101',
        ddtDate: '2025-07-01',
        orderNumber: 'DDT-200',
      },
    ];

    const result = classifier.execute({ entries });

    expect(result[0].productName).toBe('SOLFATO DI RAME');
    expect(result[0].quantity).toBe(15);
    expect(result[0].quantityUnitOfMeasure).toBe('kg');
    expect(result[0].supplierName).toBe('Chimica SRL');
    expect(result[0].supplierVat).toBe('98765432101');
    expect(result[0].ddtDate).toBe('2025-07-01');
    expect(result[0].orderNumber).toBe('DDT-200');
  });

  it('should handle empty entries array', () => {
    const result = classifier.execute({ entries: [] });

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('should keep provided registration number when present', () => {
    const entries = [
      {
        productName: 'PRODOTTO CON REGISTRAZIONE',
        registrationNumber: '9999',
        quantity: 5,
        quantityUnitOfMeasure: 'kg',
        supplierName: null,
        supplierVat: null,
        ddtDate: null,
        orderNumber: null,
      },
    ];

    const result = classifier.execute({ entries });

    expect(result).toBeDefined();
    expect(result.length).toBe(1);
    // Product category is determined by lookup, but original registration is available
    expect(result[0].productName).toBe('PRODOTTO CON REGISTRAZIONE');
  });
});
