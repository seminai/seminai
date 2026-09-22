import { mapInvoiceReviewToExtractionData } from '../application/use-cases/extraction/map-invoice-review-to-extraction-data';
import {
  __resetFertilizerFallbackCacheForTests,
  type FertilizerFallbackClassifier,
} from '../application/use-cases/extraction/llm-fallback-invoice-category';

/**
 * Integration test for the productCategory regression fix + LLM fallback.
 *
 * Bug (before fix): mapInvoiceReviewToExtractionData hardcoded `productCategory: 'OTHER'`
 * for every entry produced from the chat-review payload.
 *
 * Fix:
 *   1. InvoiceProductClassifier (sync) — dataset-driven PHYTOSANITARY + regex FERTILIZER.
 *   2. LLM fallback — every entry still OTHER (and not linked to the phytosanitary dataset)
 *      is re-checked via batched LLM call so naming variations the regex misses still get
 *      promoted to FERTILIZER. PHYTOSANITARY suggestions from the LLM are ignored —
 *      the official dataset stays the sole authority for that category.
 *   3. Per-process cache by normalized product name avoids duplicate LLM calls.
 */
jest.setTimeout(30_000);

function makeFakeLlm(
  decisions: Record<string, 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER'>,
  spy?: { calls: number; receivedNames: string[][] },
): FertilizerFallbackClassifier {
  return {
    async classifyProductNames({ productNames }) {
      if (spy) {
        spy.calls += 1;
        spy.receivedNames.push([...productNames]);
      }
      const map = new Map<string, 'PHYTOSANITARY' | 'FERTILIZER' | 'OTHER'>();
      for (const name of productNames) {
        const key = name.trim().toUpperCase();
        if (decisions[key]) map.set(key, decisions[key]);
      }
      return map;
    },
  };
}

beforeEach(() => {
  __resetFertilizerFallbackCacheForTests();
});

describe('mapInvoiceReviewToExtractionData — productCategory classification', () => {
  it('classifies fertilizer entries as FERTILIZER (regex first, deterministic)', async () => {
    const result = await mapInvoiceReviewToExtractionData(
      {
        invoiceNumber: 'FT-001',
        invoiceDate: '2026-01-15',
        supplierName: 'Fornitore SRL',
        supplierVat: 'IT12345678901',
        lines: [
          { productName: 'UREA AGRICOLA 46%', quantity: 100, unitOfMeasure: 'KG', unitPrice: 0.8 },
          {
            productName: 'NPK 20-10-10 CONCIME COMPLEX',
            quantity: 50,
            unitOfMeasure: 'KG',
            unitPrice: 1.2,
          },
        ],
      },
      { llmFallback: null }, // disable LLM — regex must already classify these
    );

    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].productCategory).toBe('FERTILIZER');
    expect(result.entries[1].productCategory).toBe('FERTILIZER');
    expect(result.entries[0].totalPrice).toBe(80);
    expect(result.entries[1].totalPrice).toBe(60);
  });

  it('LLM fallback upgrades OTHER → FERTILIZER for names the regex misses', async () => {
    const spy = { calls: 0, receivedNames: [] as string[][] };
    const fakeLlm = makeFakeLlm(
      { 'MAXFER PROFESSIONAL BIO': 'FERTILIZER', 'CARTONE DA SPEDIZIONE': 'OTHER' },
      spy,
    );

    const result = await mapInvoiceReviewToExtractionData(
      {
        invoiceNumber: 'FT-100',
        supplierName: 'X',
        lines: [
          {
            productName: 'MAXFER PROFESSIONAL BIO',
            quantity: 10,
            unitOfMeasure: 'KG',
            unitPrice: 5,
          },
          { productName: 'CARTONE DA SPEDIZIONE', quantity: 2, unitOfMeasure: 'PZ', unitPrice: 1 },
        ],
      },
      { llmFallback: fakeLlm },
    );

    expect(result.entries[0].productCategory).toBe('FERTILIZER');
    expect(result.entries[1].productCategory).toBe('OTHER');
    expect(spy.calls).toBe(1);
    expect(spy.receivedNames[0]).toEqual(['MAXFER PROFESSIONAL BIO', 'CARTONE DA SPEDIZIONE']);
  });

  it('LLM fallback is skipped when regex already classified the entry as FERTILIZER', async () => {
    const spy = { calls: 0, receivedNames: [] as string[][] };
    const fakeLlm = makeFakeLlm({}, spy);

    const result = await mapInvoiceReviewToExtractionData(
      {
        lines: [{ productName: 'UREA 46%', quantity: 1, unitOfMeasure: 'KG', unitPrice: 1 }],
      },
      { llmFallback: fakeLlm },
    );

    expect(result.entries[0].productCategory).toBe('FERTILIZER');
    expect(spy.calls).toBe(0); // regex already classified — no LLM call
  });

  it('LLM cannot upgrade entries to PHYTOSANITARY — the dataset stays the sole authority', async () => {
    // If the LLM suggests PHYTOSANITARY for an unknown product, the fallback must
    // keep it as OTHER (only OTHER → FERTILIZER upgrades are allowed).
    const fakeLlm = makeFakeLlm({ 'SPRAY MISTERIOSO XYZ': 'PHYTOSANITARY' });

    const result = await mapInvoiceReviewToExtractionData(
      {
        lines: [
          { productName: 'SPRAY MISTERIOSO XYZ', quantity: 1, unitOfMeasure: 'L', unitPrice: 1 },
        ],
      },
      { llmFallback: fakeLlm },
    );

    expect(result.entries[0].productCategory).toBe('OTHER');
    expect(result.entries[0].registrationNumber).toBeNull();
  });

  it('caches LLM decisions by normalized product name across calls', async () => {
    const spy = { calls: 0, receivedNames: [] as string[][] };
    const fakeLlm = makeFakeLlm({ 'BIOFERT EXTRA': 'FERTILIZER' }, spy);

    // First call — LLM is asked once.
    const r1 = await mapInvoiceReviewToExtractionData(
      { lines: [{ productName: 'BIOFERT EXTRA', quantity: 1, unitOfMeasure: 'KG', unitPrice: 1 }] },
      { llmFallback: fakeLlm },
    );
    expect(r1.entries[0].productCategory).toBe('FERTILIZER');
    expect(spy.calls).toBe(1);

    // Second call with same product name — served from cache, no LLM call.
    const r2 = await mapInvoiceReviewToExtractionData(
      { lines: [{ productName: 'biofert extra', quantity: 2, unitOfMeasure: 'KG', unitPrice: 1 }] },
      { llmFallback: fakeLlm },
    );
    expect(r2.entries[0].productCategory).toBe('FERTILIZER');
    expect(spy.calls).toBe(1);
  });

  it('falls back gracefully to OTHER when the LLM throws', async () => {
    const failingLlm: FertilizerFallbackClassifier = {
      async classifyProductNames() {
        throw new Error('upstream LLM 503');
      },
    };

    const result = await mapInvoiceReviewToExtractionData(
      {
        lines: [
          { productName: 'PRODOTTO SCONOSCIUTO', quantity: 1, unitOfMeasure: 'KG', unitPrice: 1 },
        ],
      },
      { llmFallback: failingLlm },
    );

    expect(result.entries[0].productCategory).toBe('OTHER');
  });

  it('handles DDT-shaped review payload (ddtNumber/ddtDate fallback)', async () => {
    const result = await mapInvoiceReviewToExtractionData(
      {
        ddtNumber: 'DDT-099',
        ddtDate: '2026-03-01',
        supplierName: 'DDT Supplier',
        lines: [{ productName: 'UREA 46%', quantity: 25, unitOfMeasure: 'KG', unitPrice: 1 }],
      },
      { llmFallback: null },
    );

    expect(result.entries[0].invoiceNumber).toBe('DDT-099');
    expect(result.entries[0].invoiceDate).toBe('2026-03-01');
    expect(result.entries[0].productCategory).toBe('FERTILIZER');
  });

  it('preserves empty lines list — no entries, classifier returns []', async () => {
    const result = await mapInvoiceReviewToExtractionData(
      { invoiceNumber: 'FT-empty', supplierName: 'X' },
      { llmFallback: null },
    );
    expect(result.entries).toEqual([]);
    expect(result.extractedCount).toBe(0);
  });
});
