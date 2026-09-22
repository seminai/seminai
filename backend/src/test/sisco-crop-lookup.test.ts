import {
  lookupSiscoCrop,
  parseSiscoUtilizzoCode,
  resetSiscoCropCatalogCache,
  resolvePcgCropLabel,
} from '../infrastructure/services/sisco-crop-lookup';

describe('sisco-crop-lookup', () => {
  beforeEach(() => {
    resetSiscoCropCatalogCache();
  });

  describe('parseSiscoUtilizzoCode', () => {
    it('normalizes Veneto 5-segment codes to 4-segment SISCO keys', () => {
      expect(parseSiscoUtilizzoCode('336-002-052-044-000')).toBe('336-002-052-044');
    });

    it('accepts Lombardia 4-segment codes', () => {
      expect(parseSiscoUtilizzoCode('001-002-010-000')).toBe('001-002-010-000');
    });

    it('returns null for invalid codes', () => {
      expect(parseSiscoUtilizzoCode('invalid')).toBeNull();
      expect(parseSiscoUtilizzoCode(null)).toBeNull();
    });
  });

  describe('lookupSiscoCrop', () => {
    it('resolves PRATO POLIFITA from Veneto PCG code', () => {
      const entry = lookupSiscoCrop('336-002-052-044-000');
      expect(entry).not.toBeNull();
      expect(entry?.cropName).toBe('PRATO POLIFITA');
      expect(entry?.cropType).toBe('336');
    });

    it('resolves GRANTURCO (MAIS) insilato from Veneto PCG code', () => {
      const entry = lookupSiscoCrop('001-002-010-000-000');
      expect(entry).not.toBeNull();
      expect(entry?.cropName).toContain('GRANTURCO (MAIS)');
    });

    it('returns null for unknown codes', () => {
      expect(lookupSiscoCrop('999-999-999-999-999')).toBeNull();
    });
  });

  describe('resolvePcgCropLabel', () => {
    it('uses SISCO catalog instead of PERMANENTE suffix from coltura text', () => {
      const result = resolvePcgCropLabel(
        'PRATO POLIFITA - DA FORAGGIO - NON AVVICENDATO PER ALMENO 5 ANNI - PERMANENTE',
        '336-002-052-044-000',
      );
      expect(result.cropName).toBe('PRATO POLIFITA');
      expect(result.cropType).toBe('336');
      expect(result.uso).toContain('DA FORAGGIO');
    });

    it('falls back to text parsing when lookup misses', () => {
      const result = resolvePcgCropLabel('VITE DA VINO - PERMANENTE', '999-999-999-999-999');
      expect(result.cropName).toBe('VITE DA VINO');
      expect(result.cropType).toBe('999');
    });

    it('falls back when cod_coltura is missing', () => {
      const result = resolvePcgCropLabel('VITE DA VINO - PERMANENTE', null);
      expect(result.cropName).toBe('VITE DA VINO');
    });
  });
});
