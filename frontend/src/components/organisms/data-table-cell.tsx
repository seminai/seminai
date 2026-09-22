import type { ReactNode } from 'react';
import { flexRender, type Cell } from '@tanstack/react-table';
import { TruncatedText } from '@/components/atoms/truncated-text';

interface DataTableTruncatedValueProps {
  readonly value: unknown;
  readonly className?: string;
}

export function DataTableTruncatedValue({
  value,
  className,
}: DataTableTruncatedValueProps): React.JSX.Element {
  if (value == null || value === '') {
    return <span className="text-muted-foreground">—</span>;
  }
  return <TruncatedText text={String(value)} maxWidth="100%" className={className} />;
}

export function renderDataTableCell<TData>(cell: Cell<TData, unknown>): ReactNode {
  const renderer = cell.column.columnDef.cell;
  if (renderer !== undefined) return flexRender(renderer, cell.getContext());
  return <DataTableTruncatedValue value={cell.getValue()} />;
}
