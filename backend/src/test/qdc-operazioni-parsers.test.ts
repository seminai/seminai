import {
  buildColumnIndexMap,
  parseTableToRecords,
} from '../infrastructure/services/integrations/qdc_imageline/operazioni-parsers';
import type { QdcTableResult } from '../infrastructure/services/integrations/qdc_imageline';

describe('buildColumnIndexMap', () => {
  it('maps upper-cased column names to their positional index', () => {
    const inputColumns = ['Id', 'PRODOTTO', 'qta'];
    const actualMap = buildColumnIndexMap(inputColumns);
    expect(actualMap.get('ID')).toBe(0);
    expect(actualMap.get('PRODOTTO')).toBe(1);
    expect(actualMap.get('QTA')).toBe(2);
  });
});

describe('parseTableToRecords', () => {
  it('keys every row by column name regardless of column order', () => {
    const inputOriginal: QdcTableResult = {
      COLUMNS: ['ID', 'PRODOTTO', 'QTA'],
      DATA: [[1, 'Rame 20', 2.5]],
    };
    const inputShuffled: QdcTableResult = {
      COLUMNS: ['QTA', 'ID', 'PRODOTTO'],
      DATA: [[2.5, 1, 'Rame 20']],
    };
    const expectedRecord = { ID: 1, PRODOTTO: 'Rame 20', QTA: 2.5 };
    expect(parseTableToRecords(inputOriginal)[0]).toEqual(expectedRecord);
    expect(parseTableToRecords(inputShuffled)[0]).toEqual(expectedRecord);
  });

  it('accepts the lowercase columns/data variant used by the operation endpoints', () => {
    const inputLowercase: QdcTableResult = {
      columns: ['ID', 'COLTURA', 'FASI'],
      data: [[7, 'VITE', [{ raccolta: '15/09/2025' }]]],
      rows: 1,
    };
    expect(parseTableToRecords(inputLowercase)[0]).toEqual({
      ID: 7,
      COLTURA: 'VITE',
      FASI: [{ raccolta: '15/09/2025' }],
    });
  });

  it('normalizes missing cells to null', () => {
    const inputResult: QdcTableResult = {
      COLUMNS: ['ID', 'NOTE'],
      DATA: [[7]],
    };
    expect(parseTableToRecords(inputResult)[0]).toEqual({ ID: 7, NOTE: null });
  });

  it('returns an empty array for undefined or malformed recordsets', () => {
    expect(parseTableToRecords(undefined)).toEqual([]);
    expect(parseTableToRecords({} as QdcTableResult)).toEqual([]);
    expect(parseTableToRecords({ COLUMNS: ['ID'] } as QdcTableResult)).toEqual([]);
  });
});
