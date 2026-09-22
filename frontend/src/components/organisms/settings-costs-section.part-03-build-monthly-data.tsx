import type { TokenUsage } from './settings-costs-section.part-01-token-usage';
import type { ChartRow } from './settings-costs-section.part-02-settings-costs-section';
import { toMonthKey } from './settings-costs-section.part-02-settings-costs-section';

export function buildMonthlyData(usages: readonly TokenUsage[]): ChartRow[] {
  const map = new Map<string, Record<string, string | number>>();
  for (const u of usages) {
    const key = toMonthKey(u.createdAt);
    const entry = map.get(key) ?? { month: key };
    entry[u.model] = ((entry[u.model] as number) ?? 0) + u.costClient;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) =>
    (a.month as string).localeCompare(b.month as string),
  ) as ChartRow[];
}

export function SectionState({ label }: { readonly label: string }) {
  return (
    <div className="flex min-h-[220px] items-center justify-center p-5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}
