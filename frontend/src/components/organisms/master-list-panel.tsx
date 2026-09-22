import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface MasterListPanelProps<TData extends { id: string }> {
  readonly data: readonly TData[];
  readonly columns: ColumnDef<TData, unknown>[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
  readonly title: string;
}

export function MasterListPanel<TData extends { id: string }>({
  data,
  columns,
  selectedId,
  onSelect,
  title,
}: MasterListPanelProps<TData>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // TanStack Table intentionally returns non-memoizable callbacks managed by its own state machine.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: data as TData[],
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted-foreground">{data.length} elementi</span>
      </div>

      <div className="flex-1 overflow-auto">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="hover:bg-transparent">
                {hg.headers.map((header) => (
                  <TableHead key={header.id} className="h-9 text-xs">
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                className={cn(
                  'cursor-pointer transition-colors',
                  row.original.id === selectedId && 'bg-accent/50',
                )}
                onClick={() => onSelect(row.original.id)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id} className="py-2 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
