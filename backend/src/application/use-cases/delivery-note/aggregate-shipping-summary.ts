import { DeliveryNote } from '../../../domain/entities/DeliveryNote';
import {
  ShippingSummaryDto,
  ShippingSummaryRow,
  ShippingSummaryTotals,
} from '../../../domain/dtos/shipping-summary.dto';

interface MutableGroup {
  date: string;
  carrier: string | null;
  recipients: Set<string>;
  ddtIds: string[];
  packagesCount: number;
  estimatedWeightKg: number;
}

function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Groups DDTs by shipping date + carrier, summing packages/weight and listing recipients. */
export function aggregateShippingSummary(notes: readonly DeliveryNote[]): ShippingSummaryDto {
  const groups = new Map<string, MutableGroup>();
  for (const note of notes) {
    const date = dateKey(note.ddtDate);
    const key = `${date}|${note.carrier ?? ''}`;
    const group = groups.get(key) ?? {
      date,
      carrier: note.carrier,
      recipients: new Set<string>(),
      ddtIds: [],
      packagesCount: 0,
      estimatedWeightKg: 0,
    };
    group.recipients.add(note.customerSnapshot.name);
    group.ddtIds.push(note.id);
    group.packagesCount += note.packagesCount ?? 0;
    group.estimatedWeightKg += note.estimatedWeightKg ?? 0;
    groups.set(key, group);
  }
  const rows: ShippingSummaryRow[] = [...groups.values()]
    .map((group) => ({
      date: group.date,
      carrier: group.carrier,
      recipients: [...group.recipients],
      ddtCount: group.ddtIds.length,
      packagesCount: group.packagesCount,
      estimatedWeightKg: group.estimatedWeightKg,
      ddtIds: group.ddtIds,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));
  const totals: ShippingSummaryTotals = rows.reduce(
    (acc, row) => ({
      ddtCount: acc.ddtCount + row.ddtCount,
      packagesCount: acc.packagesCount + row.packagesCount,
      estimatedWeightKg: acc.estimatedWeightKg + row.estimatedWeightKg,
    }),
    { ddtCount: 0, packagesCount: 0, estimatedWeightKg: 0 },
  );
  return { rows, totals };
}
