import { describe, expect, it } from 'vitest';
import {
  getSearchValidationError,
  getSubmitValidationError,
} from './production-units-wizard-validation';
import type { ProductionUnitDraft } from './production-units-wizard-types';

const RANGE = { start: '2026-01-01', end: '2026-12-31' };

function draft(allocations: ProductionUnitDraft['allocations']): ProductionUnitDraft {
  return {
    id: 'u1',
    name: 'Unità',
    cropCode: '',
    cropName: '',
    cropType: '',
    variety: '',
    protocoll: '',
    protectionStructure: '',
    startDate: RANGE.start,
    floweringDate: '',
    harvestingDate: '',
    endDate: RANGE.end,
    acquaTotalePeridoL: null,
    occupazione: '',
    destinazioneDiUso: '',
    allocations,
  };
}

describe('getSearchValidationError', () => {
  it('requires company, period and a coherent range', () => {
    expect(getSearchValidationError('', RANGE)).toBe("Seleziona l'azienda");
    expect(getSearchValidationError('c1', { start: '', end: RANGE.end })).toBe('Imposta il periodo');
    expect(getSearchValidationError('c1', { start: '2026-12-31', end: '2026-01-01' })).toBe(
      'La data di inizio deve precedere la fine',
    );
    expect(getSearchValidationError('c1', RANGE)).toBeNull();
  });
});

describe('getSubmitValidationError', () => {
  it('rejects an empty unit list', () => {
    expect(getSubmitValidationError([])?.message).toBe("Aggiungi almeno un'unità con allocazioni");
  });

  it('rejects unresolved and duplicated field ids', () => {
    expect(
      getSubmitValidationError([draft([{ fieldId: '', areaHa: 1 }])])?.message,
    ).toBe('Assegna tutti i campi prima di confermare');
    expect(
      getSubmitValidationError([
        draft([
          { fieldId: 'f1', areaHa: 1 },
          { fieldId: 'f1', areaHa: 2 },
        ]),
      ])?.message,
    ).toBe('Due allocazioni puntano allo stesso campo');
  });

  it('accepts valid allocations', () => {
    expect(getSubmitValidationError([draft([{ fieldId: 'f1', areaHa: 1 }])])).toBeNull();
  });
});
