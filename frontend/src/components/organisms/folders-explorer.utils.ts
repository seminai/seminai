import type { ArchiveListItem } from '@/types/extraction';

export interface CategoryGroup {
  readonly key: string;
  readonly label: string;
  readonly items: readonly ArchiveListItem[];
}

const CATEGORY_LABELS: Record<string, string> = {
  fields: 'Campi',
  production_units: 'Unita produttive',
  agricultural: 'Dati agricoli',
  invoice: 'Fatture',
  ddt: 'DDT',
  stock: 'Magazzino',
  company: 'Azienda',
  job_group: 'Operazioni confermate',
  products: 'Magazzino',
};

function getCategoryGroupKey(item: ArchiveListItem): string {
  if (item.kind === 'generated') return `generated:${item.generatedType ?? 'company'}`;
  return `extraction:${item.category}`;
}

function getCategoryLabel(groupKey: string): string {
  const raw = groupKey.split(':')[1] ?? groupKey;
  return CATEGORY_LABELS[raw] ?? raw;
}

export function groupByCategory(items: readonly ArchiveListItem[]): readonly CategoryGroup[] {
  const completedItems = items.filter((item) => item.kind === 'generated' || item.status === 'CONFIRMED');
  const byKey = new Map<string, ArchiveListItem[]>();
  for (const item of completedItems) {
    const groupKey = getCategoryGroupKey(item);
    const current = byKey.get(groupKey);
    if (current) current.push(item);
    else byKey.set(groupKey, [item]);
  }
  return [...byKey.entries()]
    .map(([key, groupItems]) => ({ key, label: getCategoryLabel(key), items: groupItems }))
    .sort((left, right) => left.label.localeCompare(right.label, 'it'));
}
