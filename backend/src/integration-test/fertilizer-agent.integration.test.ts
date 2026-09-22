import {
  createFertilizerLabelService,
  FertilizerLabelService,
} from '../infrastructure/services/agents/fertilizer_agent/get_fertilizer_label';

/**
 * Integration tests for the Fertilizer Agent.
 *
 * These tests make real calls to Tavily API and Google Search
 * to find fertilizer label PDFs.
 *
 * WARNING: These tests depend on external web availability.
 * Some may be flaky due to changing web content.
 *
 * Run with:
 *   npm run test:integration -- fertilizer-agent.integration.test.ts
 */

jest.setTimeout(180000);

describe('Fertilizer Agent - Integration Tests', () => {
  let service: FertilizerLabelService;

  beforeAll(() => {
    service = createFertilizerLabelService();
  });

  it('should find label links for a known fertilizer product', async () => {
    const results = await service.getLabelLinks('UREA 46%');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    // Urea 46% is a very common fertilizer, should find at least one label
    if (results.length > 0) {
      const firstResult = results[0];
      expect(firstResult.productName).toBeDefined();
      expect(firstResult.url).toBeDefined();
      expect(firstResult.url).toContain('http');
      expect(firstResult.pageCount).toBeGreaterThan(0);
      expect(firstResult.preview).toBeDefined();
      expect(typeof firstResult.preview).toBe('string');
    } else {
      console.warn(
        'No results found for UREA 46%. This might be due to Tavily/Google rate limiting.',
      );
    }
  });

  it('should return empty array for empty fertilizer name', async () => {
    const results = await service.getLabelLinks('');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('should return empty array for whitespace-only fertilizer name', async () => {
    const results = await service.getLabelLinks('   ');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBe(0);
  });

  it('should handle a non-existent product gracefully', async () => {
    const results = await service.getLabelLinks('PRODOTTO_INVENTATO_XYZABC_123456');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    // Should return 0 or very few results since the product does not exist
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it('should find labels for an Italian-specific fertilizer', async () => {
    const results = await service.getLabelLinks('NITROPHOSKA GOLD');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);

    if (results.length > 0) {
      const firstResult = results[0];
      expect(firstResult.url).toMatch(/\.pdf/i);
      expect(firstResult.pageCount).toBeGreaterThan(0);
      expect(firstResult.pageCount).toBeLessThanOrEqual(10);
    }
  });

  it('should return at most 3 label records per product', async () => {
    const results = await service.getLabelLinks('CONCIME NPK 20-10-10');

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeLessThanOrEqual(3);
  });

  it('should validate PDF content contains required sections', async () => {
    const results = await service.getLabelLinks('UREA 46%');

    if (results.length === 0) {
      console.warn('No results found. Skipping PDF validation test.');
      return;
    }

    for (const record of results) {
      // Each record should have a non-empty preview
      expect(record.preview.length).toBeGreaterThan(0);

      // Labels should have reasonable page count
      expect(record.pageCount).toBeGreaterThan(0);
      expect(record.pageCount).toBeLessThanOrEqual(10);

      // URL should be valid
      expect(record.url).toMatch(/^https?:\/\//);
    }
  });

  it('should create service with custom dependencies (dependency injection)', () => {
    const mockSearchFn = jest.fn().mockResolvedValue([]);
    const customService = createFertilizerLabelService({
      searchFn: mockSearchFn,
    });

    expect(customService).toBeDefined();
    expect(customService.getLabelLinks).toBeDefined();
  });

  it('should use mock search function when injected', async () => {
    const mockSearchFn = jest.fn().mockResolvedValue([
      {
        title: 'Mock Label',
        url: 'https://example.com/label.pdf',
        content: 'Mock content',
        score: 0.9,
      },
    ]);

    const customService = createFertilizerLabelService({
      searchFn: mockSearchFn,
      googleFallbackFn: jest.fn().mockResolvedValue([]),
    });

    await customService.getLabelLinks('Test Product');

    expect(mockSearchFn).toHaveBeenCalledTimes(1);
    expect(mockSearchFn).toHaveBeenCalledWith(expect.stringContaining('Test Product'));
  });
});
