import { describe, expect, it } from 'vitest';
import {
  mapBrogliaccioToManualRows,
  mapBrogliaccioToPlanningProducts,
  summarizeBrogliaccioImport,
} from './brogliaccio-adapter';
import type { ExtractBrogliacciResponse } from '@/types/brogliaccio';

const RESPONSE: ExtractBrogliacciResponse = {
  status: 'success',
  data: {
    results: [
      {
        fileName: 'brogliaccio.jpg',
        status: 'extracted',
        rawEntries: [],
        payload: [
          {
            productionUnitName: 'Vigneto Nord',
            dateOfOpeation: '2025-04-10T00:00:00.000Z',
            category: 'TREATMENT',
            quantity: 1.2,
            unitOfMeasureQuantity: 'l',
            treatedSurface: 2.5,
            totalDistributedWaterL: 400,
            stocks: [
              {
                product: {
                  name: 'Fungicida XYZ',
                  category: 'PESTICIDE',
                  type: 'Fitosanitario',
                  registrationNumber: '12345',
                },
                quantity: -1.2,
                unitOfMeasureQuantity: 'l',
                type: 'OUT',
              },
            ],
          },
        ],
      },
      {
        fileName: 'sfocato.webp',
        status: 'failed',
        error: 'Unreadable image',
        rawEntries: [],
        payload: [],
      },
    ],
  },
};

describe('brogliaccio adapter', () => {
  it('maps backend payloads to manual rows', () => {
    const actualRows = mapBrogliaccioToManualRows(RESPONSE, {
      idPrefix: 'test',
      productionUnitOptions: [{ id: 'unit-1', name: 'vigneto nord' }],
    });

    expect(actualRows).toEqual([
      {
        id: 'test-manual-0-0',
        productName: 'Fungicida XYZ',
        registrationNumber: '12345',
        quantity: 1.2,
        quantityUnitOfMeasure: 'L',
        date: '2025-04-10',
        productionUnitId: 'unit-1',
        category: 'TREATMENT',
      },
    ]);
  });

  it('maps backend payloads to automatic planning products', () => {
    const actualProducts = mapBrogliaccioToPlanningProducts(RESPONSE);

    expect(actualProducts).toEqual([
      {
        productName: 'Fungicida XYZ',
        registrationNumber: '12345',
        quantity: 1.2,
        quantityUnitOfMeasure: 'L',
        treatedAreaHa: 2.5,
      },
    ]);
  });

  it('summarizes partial extraction failures', () => {
    const actualSummary = summarizeBrogliaccioImport(RESPONSE, 1);

    expect(actualSummary).toEqual({
      extractedFiles: 1,
      failedFiles: 1,
      rowCount: 1,
      failedFileNames: ['sfocato.webp'],
    });
  });
});
