import { DeliveryNote } from '../domain/entities/DeliveryNote';
import { aggregateShippingSummary } from '../application/use-cases/delivery-note/aggregate-shipping-summary';

function ddt(input: {
  id: string;
  date: Date;
  carrier: string | null;
  packages: number | null;
  weight: number | null;
  recipient: string;
}): DeliveryNote {
  return {
    id: input.id,
    ddtDate: input.date,
    carrier: input.carrier,
    packagesCount: input.packages,
    estimatedWeightKg: input.weight,
    customerSnapshot: { name: input.recipient },
  } as unknown as DeliveryNote;
}

describe('aggregateShippingSummary', () => {
  it('groups by date+carrier, sums packages/weight, dedups recipients', () => {
    const day = new Date('2026-06-25T09:00:00.000Z');
    const summary = aggregateShippingSummary([
      ddt({ id: 'a', date: day, carrier: 'BRT', packages: 2, weight: 10, recipient: 'Rossi' }),
      ddt({ id: 'b', date: day, carrier: 'BRT', packages: 3, weight: 5, recipient: 'Rossi' }),
      ddt({ id: 'c', date: day, carrier: 'GLS', packages: 1, weight: 4, recipient: 'Bianchi' }),
    ]);

    expect(summary.rows).toHaveLength(2); // BRT + GLS on the same day
    const brt = summary.rows.find((r) => r.carrier === 'BRT')!;
    expect(brt.ddtCount).toBe(2);
    expect(brt.packagesCount).toBe(5);
    expect(brt.estimatedWeightKg).toBe(15);
    expect(brt.recipients).toEqual(['Rossi']); // deduped
    expect(brt.ddtIds).toEqual(['a', 'b']);
    expect(summary.totals).toEqual({ ddtCount: 3, packagesCount: 6, estimatedWeightKg: 19 });
  });

  it('treats null packages/weight as zero and an empty list as empty totals', () => {
    const summary = aggregateShippingSummary([
      ddt({
        id: 'a',
        date: new Date('2026-06-25'),
        carrier: null,
        packages: null,
        weight: null,
        recipient: 'X',
      }),
    ]);
    expect(summary.rows[0].packagesCount).toBe(0);
    expect(summary.rows[0].estimatedWeightKg).toBe(0);
    expect(aggregateShippingSummary([])).toEqual({
      rows: [],
      totals: { ddtCount: 0, packagesCount: 0, estimatedWeightKg: 0 },
    });
  });
});
