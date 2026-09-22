import { describe, expect, it } from 'vitest';
import {
  buildJobOperationsPrintExportParams,
  buildJobOperationsPrintExportRow,
} from './job-operations-print-export';
import type { JobOperationRow } from './types';
import type { JobOperationsTableRow } from './jobs-operations-table-types';

function createOperation(overrides: Partial<JobOperationRow> = {}): JobOperationRow {
  return {
    id: 'job-1',
    jobId: 'group-1',
    dateIso: '2025-07-29T00:00:00.000Z',
    category: 'TREATMENT',
    productName: 'Zoxium 240 SC',
    productionUnitName: 'POMODORO',
    productionUnitId: 'pu-1',
    quantity: 1.694,
    unitOfMeasureQuantity: 'L',
    machineId: null,
    machineName: null,
    isVerified: false,
    conformityChecked: true,
    note: '⚠️ ATTENZIONE: Stock insufficiente! Disponibile: 4.00 L, Richiesto totale: 8.44 L.',
    alertNotes: {
      epoca_impiego_llm: 'pre-raccolta',
      dose_minima: 0.63,
      dose_massima: 0.75,
      dose_um: 'L/ha',
      stock_in_warehouse: 4,
      malattie: ['Peronospora (Phytophtora infestans)', 'Alternariosi (Alternaria solani)'],
      principio_attivo: 'Zoxamid',
    },
    history: null,
    raw: {
      job: {
        treatedSurface: 2.4545,
        avversity: 'Fallback avversity',
        note: '⚠️ ATTENZIONE: Stock insufficiente! Disponibile: 4.00 L, Richiesto totale: 8.44 L.',
      },
    },
    ...overrides,
  };
}

describe('buildJobOperationsPrintExportRow', () => {
  it('maps operation fields to print export columns', () => {
    const row = buildJobOperationsPrintExportRow(createOperation(), undefined);

    expect(row.stato).toBe('Non verificata');
    expect(row.data).toBe('29/07/2025');
    expect(row.faseFenologica).toBe('pre-raccolta');
    expect(row.unitaProduttiva).toBe('POMODORO');
    expect(row.prodotto).toBe('Zoxium 240 SC');
    expect(row.principioAttivo).toBe('Zoxamid');
    expect(row.quantitaTrattamento).toBe('1,694');
    expect(row.udm).toBe('L');
    expect(row.superficieHa).toBe('2,4545');
    expect(row.doseMin).toBe('0,63');
    expect(row.doseMax).toBe('0,75');
    expect(row.doseMediaCalcolo).toBe('0,69');
    expect(row.umDose).toBe('L/ha');
    expect(row.disponibileMagazzino).toBe('4');
    expect(row.malattieTarget).toBe(
      'Peronospora (Phytophtora infestans), Alternariosi (Alternaria solani)',
    );
    expect(row.noteMagazzino).toContain('Stock insufficiente');
  });

  it('respects draft values for date and quantity', () => {
    const row = buildJobOperationsPrintExportRow(createOperation(), {
      id: 'job-1',
      isNew: false,
      dateIso: '2025-08-10',
      quantity: '2,5',
      machineId: '',
      isVerified: true,
      category: 'TREATMENT',
      unitOfMeasureQuantity: 'L',
      productionUnitId: 'pu-1',
    });

    expect(row.data).toBe('10/08/2025');
    expect(row.quantitaTrattamento).toBe('2,5');
    expect(row.stato).toBe('Verificata');
  });
});

describe('buildJobOperationsPrintExportParams', () => {
  it('exports only operation rows and excludes drafts', () => {
    const operationRow: JobOperationsTableRow = {
      kind: 'operation',
      rowId: 'job-1',
      operation: createOperation(),
      draft: null,
      statoLabel: 'Non verificata',
      verificaLabel: 'No',
      tipoLabel: 'TREATMENT',
      prodottoLabel: 'Zoxium 240 SC',
      upLabel: 'POMODORO',
      quantitaLabel: '1,694 L',
      macchinaLabel: '—',
      dataSortKey: '2025-07-29T00:00:00.000Z',
      dataLabel: '2025-07-29',
    };
    const draftRow: JobOperationsTableRow = {
      kind: 'draft',
      rowId: 'draft-1',
      operation: null,
      draft: {
        id: 'draft-1',
        isNew: true,
        dateIso: '2025-08-01',
        quantity: '1',
        machineId: '',
        isVerified: false,
        category: 'TREATMENT',
        unitOfMeasureQuantity: 'L',
        productionUnitId: 'pu-1',
      },
      statoLabel: 'Conformità non verificata',
      verificaLabel: 'No',
      tipoLabel: 'TREATMENT',
      prodottoLabel: 'Nuova riga',
      upLabel: 'pu-1',
      quantitaLabel: '1 L',
      macchinaLabel: '—',
      dataSortKey: '2025-08-01',
      dataLabel: '2025-08-01',
    };

    const params = buildJobOperationsPrintExportParams({
      tableRows: [operationRow, draftRow],
      drafts: {},
      filename: 'test-export',
    });

    expect(params.headers).toHaveLength(16);
    expect(params.rows).toHaveLength(1);
    expect(params.rows[0]?.[4]).toBe('Zoxium 240 SC');
    expect(params.rows[0]?.[5]).toBe('Zoxamid');
    expect(params.filename).toBe('test-export');
  });
});
