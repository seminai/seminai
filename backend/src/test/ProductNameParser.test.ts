import { describe, it, expect } from '@jest/globals';
import {
  parseProductName,
  isPiecesUnit,
  convertPiecesToRealUnit,
} from '../infrastructure/services/utils/ProductNameParser';

describe('parseProductName', () => {
  describe('existing "da" pattern', () => {
    it('extracts packaging from "REFINE SX da gr.10"', () => {
      const result = parseProductName('REFINE SX da gr.10');
      expect(result.packagingQuantity).toBe(10);
      expect(result.packagingUnit).toBe('GR');
      expect(result.baseName).toBe('REFINE SX');
    });

    it('extracts packaging from "PRODOTTO da kg 5"', () => {
      const result = parseProductName('PRODOTTO da kg 5');
      expect(result.packagingQuantity).toBe(5);
      expect(result.packagingUnit).toBe('KG');
      expect(result.baseName).toBe('PRODOTTO');
    });
  });

  describe('embedded quantity pattern (number before unit)', () => {
    it('extracts from "boom effect 500 g"', () => {
      const result = parseProductName('boom effect 500 g');
      expect(result.packagingQuantity).toBe(500);
      expect(result.packagingUnit).toBe('GR');
      expect(result.baseName).toBe('boom effect');
    });

    it('extracts from "prodotto 1,5 kg"', () => {
      const result = parseProductName('prodotto 1,5 kg');
      expect(result.packagingQuantity).toBe(1.5);
      expect(result.packagingUnit).toBe('KG');
      expect(result.baseName).toBe('prodotto');
    });

    it('extracts from "fungicida 500g"', () => {
      const result = parseProductName('fungicida 500g');
      expect(result.packagingQuantity).toBe(500);
      expect(result.packagingUnit).toBe('GR');
      expect(result.baseName).toBe('fungicida');
    });

    it('extracts from "PRODOTTO XY 1 lt"', () => {
      const result = parseProductName('PRODOTTO XY 1 lt');
      expect(result.packagingQuantity).toBe(1);
      expect(result.packagingUnit).toBe('LT');
      expect(result.baseName).toBe('PRODOTTO XY');
    });

    it('extracts from "HERBICIDE 250 ml"', () => {
      const result = parseProductName('HERBICIDE 250 ml');
      expect(result.packagingQuantity).toBe(250);
      expect(result.packagingUnit).toBe('ML');
      expect(result.baseName).toBe('HERBICIDE');
    });

    it('does NOT extract from "METRIPHAR 70 WG" (WG not a unit)', () => {
      const result = parseProductName('METRIPHAR 70 WG');
      expect(result.packagingQuantity).toBeNull();
      expect(result.packagingUnit).toBeNull();
    });

    it('does NOT extract from "FERTILIZZANTE 27% GRANULARE"', () => {
      const result = parseProductName('FERTILIZZANTE 27% GRANULARE');
      expect(result.packagingQuantity).toBeNull();
      expect(result.packagingUnit).toBeNull();
    });

    it('prefers "da" pattern over embedded pattern', () => {
      const result = parseProductName('prodotto 500 g da kg 2');
      expect(result.packagingQuantity).toBe(2);
      expect(result.packagingUnit).toBe('KG');
    });
  });

  describe('UNIT.NUMBER pattern (e.g. KG.600, LT.5)', () => {
    it('extracts from "SERCADIS SC LT.1-clp"', () => {
      const result = parseProductName('SERCADIS SC LT.1-clp');
      expect(result.packagingQuantity).toBe(1);
      expect(result.packagingUnit).toBe('LT');
      expect(result.baseName).toBe('SERCADIS SC');
    });

    it('extracts from "CONC.ACTIVE PREMIUM BASE 6-12-18+32SO3 saccone KG.600"', () => {
      const result = parseProductName('CONC.ACTIVE PREMIUM BASE 6-12-18+32SO3 saccone KG.600');
      expect(result.packagingQuantity).toBe(600);
      expect(result.packagingUnit).toBe('KG');
      expect(result.baseName).toBe('CONC.ACTIVE PREMIUM BASE 6-12-18+32SO3 saccone');
    });

    it('extracts from "SCHERMO 0.5G KG.10-clp" (picks KG.10, not 0.5G)', () => {
      const result = parseProductName('SCHERMO 0.5G KG.10-clp');
      expect(result.packagingQuantity).toBe(10);
      expect(result.packagingUnit).toBe('KG');
      expect(result.baseName).toBe('SCHERMO 0.5G');
    });

    it('extracts from "SONG 70 WDG gr.500-clp"', () => {
      const result = parseProductName('SONG 70 WDG gr.500-clp');
      expect(result.packagingQuantity).toBe(500);
      expect(result.packagingUnit).toBe('GR');
      expect(result.baseName).toBe('SONG 70 WDG');
    });

    it('extracts from "MEDOR 70WDG KG.0,250-clp"', () => {
      const result = parseProductName('MEDOR 70WDG KG.0,250-clp');
      expect(result.packagingQuantity).toBe(0.25);
      expect(result.packagingUnit).toBe('KG');
      expect(result.baseName).toBe('MEDOR 70WDG');
    });

    it('does NOT match reg.08184 as packaging', () => {
      const result = parseProductName('CHALLENGE reg.08184 LT.5-clp-');
      expect(result.packagingQuantity).toBe(5);
      expect(result.packagingUnit).toBe('LT');
      expect(result.baseName).toBe('CHALLENGE reg.08184');
    });
  });

  describe('inline NUMBERunit pattern (e.g. 10kg)', () => {
    it('extracts from "FORCE ULTRA 10kg.-clp-"', () => {
      const result = parseProductName('FORCE ULTRA 10kg.-clp-');
      expect(result.packagingQuantity).toBe(10);
      expect(result.packagingUnit).toBe('KG');
      expect(result.baseName).toBe('FORCE ULTRA');
    });

    it('prefers UNIT.NUMBER over trailing single-letter unit', () => {
      const full = parseProductName('SCHERMO 0.5G KG.10-clp');
      expect(full.packagingQuantity).toBe(10);
      expect(full.packagingUnit).toBe('KG');
      expect(full.baseName).toBe('SCHERMO 0.5G');
    });
  });

  describe('empty / null inputs', () => {
    it('returns empty baseName for empty string', () => {
      const result = parseProductName('');
      expect(result.baseName).toBe('');
      expect(result.packagingQuantity).toBeNull();
    });
  });
});

describe('isPiecesUnit', () => {
  it.each(['pz', 'pz.', 'pezzi', 'conf', 'conf.', 'nr', 'nr.', 'n.'])(
    'recognizes original variant "%s"',
    (unit) => {
      expect(isPiecesUnit(unit)).toBe(true);
    },
  );

  it.each(['lotti', 'um', 'units', 'unità'])('recognizes new variant "%s"', (unit) => {
    expect(isPiecesUnit(unit)).toBe(true);
  });

  it.each(['PZ', 'PEZZI', 'Lotti', 'UM', 'Units', 'UNITÀ'])(
    'is case insensitive for "%s"',
    (unit) => {
      expect(isPiecesUnit(unit)).toBe(true);
    },
  );

  it.each(['kg', 'lt', 'ml', 'g', 'tn'])('returns false for "%s"', (unit) => {
    expect(isPiecesUnit(unit)).toBe(false);
  });
});

describe('convertPiecesToRealUnit', () => {
  it('converts pieces with embedded quantity: 2 pz of "boom effect 500 g"', () => {
    const result = convertPiecesToRealUnit(2, 'pz', 'boom effect 500 g');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(1000);
    expect(result.unitOfMeasure).toBe('GR');
  });

  it('converts pieces with "da" pattern: 8 pz of "REFINE SX da gr.10"', () => {
    const result = convertPiecesToRealUnit(8, 'pz', 'REFINE SX da gr.10');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(80);
    expect(result.unitOfMeasure).toBe('GR');
  });

  it('converts with new variant "lotti"', () => {
    const result = convertPiecesToRealUnit(3, 'lotti', 'PRODOTTO 500 g');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(1500);
    expect(result.unitOfMeasure).toBe('GR');
  });

  it('converts with new variant "um"', () => {
    const result = convertPiecesToRealUnit(2, 'um', 'PRODOTTO 1 lt');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(2);
    expect(result.unitOfMeasure).toBe('LT');
  });

  it('returns unconverted when no packaging info in product name', () => {
    const result = convertPiecesToRealUnit(2, 'pz', 'METRIPHAR 70 WG');
    expect(result.converted).toBe(false);
    expect(result.quantity).toBe(2);
    expect(result.unitOfMeasure).toBe('pz');
  });

  it('returns unconverted when unit is not pieces', () => {
    const result = convertPiecesToRealUnit(5, 'kg', 'boom effect 500 g');
    expect(result.converted).toBe(false);
    expect(result.quantity).toBe(5);
    expect(result.unitOfMeasure).toBe('kg');
  });

  it('converts NR with UNIT.NUMBER: 1 NR of "saccone KG.600"', () => {
    const result = convertPiecesToRealUnit(
      1,
      'NR',
      'CONC.ACTIVE PREMIUM BASE 6-12-18+32SO3 saccone KG.600',
    );
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(600);
    expect(result.unitOfMeasure).toBe('KG');
  });

  it('converts NR with UNIT.NUMBER: 9 NR of "SCHERMO 0.5G KG.10-clp"', () => {
    const result = convertPiecesToRealUnit(9, 'NR', 'SCHERMO 0.5G KG.10-clp');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(90);
    expect(result.unitOfMeasure).toBe('KG');
  });

  it('converts NR with inline: 15 NR of "FORCE ULTRA 10kg.-clp-"', () => {
    const result = convertPiecesToRealUnit(15, 'NR', 'FORCE ULTRA 10kg.-clp-');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(150);
    expect(result.unitOfMeasure).toBe('KG');
  });

  it('converts NR with UNIT.NUMBER: 3 NR of "DOMITREL 400 CS LT.5-clp"', () => {
    const result = convertPiecesToRealUnit(3, 'NR', 'DOMITREL 400 CS LT.5-clp');
    expect(result.converted).toBe(true);
    expect(result.quantity).toBe(15);
    expect(result.unitOfMeasure).toBe('LT');
  });
});
