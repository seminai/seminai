import { describe, expect, it } from 'vitest';
import {
  planInvoiceCellOperation,
  type InvoiceCellCoord,
} from '@/lib/invoice-cell-operations';
import type { InvoiceEntry } from '@/types/extraction';

const baseRow: InvoiceEntry = {
  productName: '',
  registrationNumber: null,
  productCategory: 'OTHER',
  administrativeStatus: null,
  quantity: null,
  quantityUnitOfMeasure: null,
  accepted: true,
  supplierName: null,
  supplierVat: null,
  invoiceNumber: null,
  invoiceDate: null,
  invoiceDueDate: null,
  unitPrice: null,
  totalPrice: null,
};

function row(
  productName: string,
  quantity: number | null,
  registrationNumber: string | null = null,
): InvoiceEntry {
  return {
    ...baseRow,
    productName,
    quantity,
    registrationNumber,
    productCategory: productName ? 'PHYTOSANITARY' : 'OTHER',
  };
}

function cells(...items: readonly [number, InvoiceCellCoord['columnKey']][]): InvoiceCellCoord[] {
  return items.map(([rowIndex, columnKey]) => ({ rowIndex, columnKey }));
}

describe('invoice cell operations', () => {
  it('moves a partial multi-row selection up without altering unselected columns', () => {
    const rows = [row('A', 1, '001'), row('B', 2, '002'), row('C', 3, '003')];
    const plan = planInvoiceCellOperation({
      rows,
      selectedCells: cells([1, 'productName'], [1, 'quantity'], [2, 'productName'], [2, 'quantity']),
      operation: 'move-up',
    });

    expect(plan.status).toBe('ready');
    expect(plan.conflicts).toHaveLength(2);
    expect(plan.rows[0]).toMatchObject({ productName: 'B', quantity: 2, registrationNumber: '001' });
    expect(plan.rows[1]).toMatchObject({ productName: 'C', quantity: 3, registrationNumber: '002' });
    expect(plan.rows[2]).toMatchObject({ productName: '', quantity: null, registrationNumber: '003' });
  });

  it('does not report conflicts for target cells inside the moved block', () => {
    const rows = [row('', null), row('B', 2), row('C', 3)];
    const plan = planInvoiceCellOperation({
      rows,
      selectedCells: cells([1, 'productName'], [2, 'productName']),
      operation: 'move-up',
    });

    expect(plan.conflicts).toHaveLength(0);
    expect(plan.requiresConfirmation).toBe(false);
    expect(plan.rows[1]?.productName).toBe('C');
  });

  it('reports conflicts when an external destination has data', () => {
    const rows = [row('A', 1), row('B', 2)];
    const plan = planInvoiceCellOperation({
      rows,
      selectedCells: cells([1, 'productName']),
      operation: 'move-up',
    });

    expect(plan.conflicts).toEqual([{ rowIndex: 0, columnKey: 'productName' }]);
    expect(plan.requiresConfirmation).toBe(true);
  });

  it('clears selected cells using typed empty values', () => {
    const rows = [row('A', 5, '001')];
    const plan = planInvoiceCellOperation({
      rows,
      selectedCells: cells(
        [0, 'productName'],
        [0, 'quantity'],
        [0, 'registrationNumber'],
        [0, 'productCategory'],
      ),
      operation: 'clear',
    });

    expect(plan.nonEmptyCellCount).toBe(4);
    expect(plan.requiresConfirmation).toBe(true);
    expect(plan.rows[0]).toMatchObject({
      productName: '',
      quantity: null,
      registrationNumber: null,
      productCategory: 'OTHER',
    });
  });

  it('copies values from adjacent rows without changing unselected cells', () => {
    const rows = [row('A', 1, '001'), row('B', 2, '002')];
    const plan = planInvoiceCellOperation({
      rows,
      selectedCells: cells([1, 'productName']),
      operation: 'copy-above',
    });

    expect(plan.rows[1]).toMatchObject({
      productName: 'A',
      quantity: 2,
      registrationNumber: '002',
    });
  });

  it('moves down and clears only the top source edge', () => {
    const rows = [row('A', 1), row('B', 2), row('C', 3)];
    const plan = planInvoiceCellOperation({
      rows,
      selectedCells: cells([0, 'productName'], [1, 'productName']),
      operation: 'move-down',
    });

    expect(plan.rows).toHaveLength(3);
    expect(plan.rows[0]?.productName).toBe('');
    expect(plan.rows[1]?.productName).toBe('A');
    expect(plan.rows[2]?.productName).toBe('B');
    expect(plan.rows[2]?.quantity).toBe(3);
  });
});
