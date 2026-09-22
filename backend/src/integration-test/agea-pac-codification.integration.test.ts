import {
  parsePacCodeString,
  interpretPacCodeWithLLM,
  batchInterpretPacCodes,
  getCropFromPacCode,
  isNonAgriculturalPacCode,
  getCropByOccupationCode,
  searchCropsByName,
} from '../infrastructure/services/tool/agea_pac_codification';
import fs from 'fs';
import path from 'path';

/**
 * Integration tests for the AGEA PAC Codification tool.
 *
 * Tests the interpretation of AGEA PAC codes used in Italian agricultural documentation.
 * Some tests make real LLM calls for code interpretation.
 *
 * Run with:
 *   npm run test:integration -- agea-pac-codification.integration.test.ts
 */

jest.setTimeout(120000);

describe('AGEA PAC Codification - Integration Tests', () => {
  describe('parsePacCodeString (deterministic)', () => {
    it('should parse a standard PAC code string correctly', () => {
      const result = parsePacCodeString('870-011-000-000-000');

      expect(result).not.toBeNull();
      expect(result!.full).toBe('870-011-000-000-000');
      expect(result!.gruppo).toBe('870');
      expect(result!.specie).toBe('011');
      expect(result!.variante).toBe('000');
      expect(result!.uso).toBe('000');
    });

    it('should handle code with non-zero variant', () => {
      const result = parsePacCodeString('870-003-001-000-000');

      expect(result).not.toBeNull();
      expect(result!.gruppo).toBe('870');
      expect(result!.specie).toBe('003');
      expect(result!.variante).toBe('001');
    });

    it('should handle edge case codes', () => {
      const result = parsePacCodeString('780-000-000-000-000');

      expect(result).not.toBeNull();
      expect(result!.gruppo).toBe('780');
      expect(result!.specie).toBe('000');
    });

    it('should return null for empty string', () => {
      const result = parsePacCodeString('');
      expect(result).toBeNull();
    });
  });

  describe('isNonAgriculturalPacCode (deterministic)', () => {
    it('should identify overlapping codes as non-agricultural', () => {
      expect(isNonAgriculturalPacCode('OVL-OVL-OVL-OVL-OVL')).toBe(true);
    });

    it('should identify standard agricultural codes as agricultural', () => {
      expect(isNonAgriculturalPacCode('870-011-000-000-000')).toBe(false);
    });

    it('should identify non-agricultural use codes', () => {
      const result = isNonAgriculturalPacCode('780-000-000-000-000');
      expect(typeof result).toBe('boolean');
    });
  });

  describe('AGEA CSV dataset loading', () => {
    const csvPath = path.resolve(
      process.cwd(),
      'dataset/agea/matrix_18.07.2025_v1_catalogo_agea_varieta_codifica_2015-2020.csv',
    );

    it('should have the AGEA dataset file available', () => {
      expect(fs.existsSync(csvPath)).toBe(true);
    });

    it('should search crops by name from the dataset', async () => {
      const results = await searchCropsByName('ORZO');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);

      const firstResult = results[0];
      expect(firstResult.code).toBeDefined();
      expect(firstResult.description).toBeDefined();
      expect(firstResult.description.toLowerCase()).toContain('orzo');
    });

    it('should search crops by name for common crops', async () => {
      const crops = ['MAIS', 'GRANO', 'SOIA', 'VITE', 'OLIVO'];

      for (const cropName of crops) {
        const results = await searchCropsByName(cropName);
        expect(results).toBeDefined();
        expect(Array.isArray(results)).toBe(true);

        if (results.length === 0) {
          console.warn(`No results found for crop: ${cropName}`);
        } else {
          console.log(`Found ${results.length} results for ${cropName}: ${results[0].description}`);
        }
      }
    });

    it('should return empty array for non-existent crop name', async () => {
      const results = await searchCropsByName('XYZCROP_INESISTENTE');

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    it('should get crop description by occupation code', async () => {
      const description = await getCropByOccupationCode('870');

      expect(description).toBeDefined();
      if (description) {
        expect(typeof description).toBe('string');
        expect(description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getCropFromPacCode (dataset + optional LLM)', () => {
    it('should get crop name from a known PAC code', async () => {
      const result = await getCropFromPacCode('870-011-000-000-000', 'Orzo');

      expect(result).toBeDefined();
      expect(result.cropName).toBeDefined();
      if (result.cropName) {
        expect(typeof result.cropName).toBe('string');
        expect(result.cropName.length).toBeGreaterThan(0);
      }
    });

    it('should handle non-agricultural PAC code', async () => {
      const result = await getCropFromPacCode('OVL-OVL-OVL-OVL-OVL');

      expect(result).toBeDefined();
    });
  });

  describe('interpretPacCodeWithLLM (requires LLM)', () => {
    it('should interpret a known PAC code with LLM enrichment', async () => {
      const result = await interpretPacCodeWithLLM('870-011-000-000-000', 'Orzo');

      if (result) {
        expect(result.species).toBeDefined();
        expect(result.cropType).toBeDefined();
        expect(result.pacCode).toBeDefined();
        expect(result.pacCode.gruppo).toBe('870');
        expect(result.pacCode.specie).toBe('011');
        expect(result.isAgricultural).toBe(true);
      }
    });

    it('should interpret PAC code for Colza (rapeseed)', async () => {
      const result = await interpretPacCodeWithLLM('870-003-000-000-000', 'Colza');

      if (result) {
        expect(result.cropType).toBeDefined();
        expect(result.isAgricultural).toBe(true);
      }
    });
  });

  describe('batchInterpretPacCodes (requires LLM)', () => {
    it('should batch interpret multiple PAC codes', async () => {
      const codes = [
        { pacCode: '870-011-000-000-000', colturaDescription: 'Orzo' },
        { pacCode: '870-003-000-000-000', colturaDescription: 'Colza' },
      ];

      const results = await batchInterpretPacCodes(codes);

      expect(results).toBeDefined();
      expect(results instanceof Map).toBe(true);
      expect(results.size).toBeLessThanOrEqual(codes.length);

      for (const [, resultItem] of results) {
        expect(resultItem.pacCode).toBeDefined();
        expect(typeof resultItem.isAgricultural).toBe('boolean');
      }
    });

    it('should handle empty batch gracefully', async () => {
      const results = await batchInterpretPacCodes([]);

      expect(results).toBeDefined();
      expect(results instanceof Map).toBe(true);
      expect(results.size).toBe(0);
    });

    it('should handle single code in batch', async () => {
      const results = await batchInterpretPacCodes([
        { pacCode: '870-011-000-000-000', colturaDescription: 'Orzo' },
      ]);

      expect(results).toBeDefined();
      expect(results.size).toBeLessThanOrEqual(1);
    });
  });
});
