import { useMemo, useCallback } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  flexRender,
  type ColumnDef,
} from '@tanstack/react-table';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ColumnFilter } from '@/components/molecules/column-filter';
import { SelectionActionBar } from '@/components/molecules/selection-action-bar';
import { exportCsv, exportExcel, exportPdf } from '@/lib/export';
import { buildTableExportParams } from '@/lib/table-export';
import { useExportFilename } from '@/hooks/use-export-filename';
import { Trash2 } from 'lucide-react';
import type { PlanningProduct } from '@/types/planning';

interface IndexedProduct extends PlanningProduct {
  readonly _index: number;
}

function multiValueFilter(
  row: { getValue: (id: string) => unknown },
  columnId: string,
  filterValue: string[],
) {
  if (!filterValue || filterValue.length === 0) return true;
  return filterValue.includes(String(row.getValue(columnId)));
}

interface ProductSpreadsheetProps {
  readonly products: readonly PlanningProduct[];
  readonly selectedIndices: ReadonlySet<number>;
  readonly onProductChange: (index: number, product: PlanningProduct) => void;
  readonly onToggleSelection: (index: number) => void;
  readonly onToggleAll: () => void;
  readonly onClearSelection: () => void;
  readonly onRemoveProduct: (index: number) => void;
}

const PRODUCT_EXPORT_COLUMNS = [
  { label: 'Prodotto', getValue: (row: PlanningProduct) => row.productName },
  { label: 'N. Registrazione', getValue: (row: PlanningProduct) => row.registrationNumber },
  { label: 'Quantita', getValue: (row: PlanningProduct) => row.quantity },
  { label: 'UM', getValue: (row: PlanningProduct) => row.quantityUnitOfMeasure },
] as const;

export function ProductSpreadsheet({
  products,
  selectedIndices,
  onProductChange,
  onToggleSelection,
  onToggleAll,
  onClearSelection,
  onRemoveProduct,
}: ProductSpreadsheetProps) {
  const data: IndexedProduct[] = useMemo(
    () => products.map((p, i) => ({ ...p, _index: i })),
    [products],
  );

  const allSelected = products.length > 0 && selectedIndices.size === products.length;

  const handleCellChange = useCallback(
    (index: number, field: keyof PlanningProduct, value: string | number) => {
      const product = products[index];
      if (!product) return;
      onProductChange(index, { ...product, [field]: value });
    },
    [products, onProductChange],
  );

  const columns: ColumnDef<IndexedProduct, unknown>[] = useMemo(
    () => [
      {
        id: 'select',
        header: () => <Checkbox checked={allSelected} onCheckedChange={onToggleAll} />,
        cell: ({ row }) => (
          <Checkbox
            checked={selectedIndices.has(row.original._index)}
            onCheckedChange={() => onToggleSelection(row.original._index)}
          />
        ),
        size: 32,
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        accessorKey: 'productName',
        header: ({ column }) => <ColumnFilter column={column} title="Prodotto" />,
        cell: ({ row }) => (
          <Input
            value={row.original.productName}
            placeholder="Nome prodotto"
            className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
            onChange={(e) => handleCellChange(row.original._index, 'productName', e.target.value)}
          />
        ),
        filterFn: 'multiValue' as never,
      },
      {
        accessorKey: 'registrationNumber',
        header: ({ column }) => <ColumnFilter column={column} title="N. Registrazione" />,
        cell: ({ row }) => (
          <Input
            value={row.original.registrationNumber}
            placeholder="N. reg."
            className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
            onChange={(e) =>
              handleCellChange(row.original._index, 'registrationNumber', e.target.value)
            }
          />
        ),
        filterFn: 'multiValue' as never,
        size: 160,
      },
      {
        accessorKey: 'quantity',
        header: ({ column }) => <ColumnFilter column={column} title="Quantita" />,
        cell: ({ row }) => (
          <Input
            type="number"
            value={row.original.quantity || ''}
            placeholder="Qty"
            className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
            onChange={(e) =>
              handleCellChange(row.original._index, 'quantity', Number(e.target.value) || 0)
            }
          />
        ),
        filterFn: 'multiValue' as never,
        size: 90,
      },
      {
        accessorKey: 'quantityUnitOfMeasure',
        header: ({ column }) => <ColumnFilter column={column} title="UM" />,
        cell: ({ row }) => (
          <Input
            value={row.original.quantityUnitOfMeasure}
            placeholder="UM"
            className="h-7 border-0 bg-transparent px-1 text-xs shadow-none focus-visible:ring-0"
            onChange={(e) =>
              handleCellChange(row.original._index, 'quantityUnitOfMeasure', e.target.value)
            }
          />
        ),
        filterFn: 'multiValue' as never,
        size: 70,
      },
      {
        id: 'actions',
        cell: ({ row }) => (
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-6 w-6"
            onClick={() => onRemoveProduct(row.original._index)}
          >
            <Trash2 className="h-3.5 w-3.5 text-destructive" />
          </Button>
        ),
        size: 36,
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    [
      allSelected,
      selectedIndices,
      onToggleAll,
      onToggleSelection,
      handleCellChange,
      onRemoveProduct,
    ],
  );

  // TanStack Table intentionally returns non-memoizable callbacks managed by its own state machine.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
    filterFns: { multiValue: multiValueFilter },
    enableRowSelection: false,
  });

  const filteredCount = table.getFilteredRowModel().rows.length;
  const selectedProducts = useMemo(
    () => products.filter((_, index) => selectedIndices.has(index)),
    [products, selectedIndices],
  );

  const exportFilename = useExportFilename({ section: 'planning' });
  const getExportData = useMemo(
    () =>
      buildTableExportParams({
        columns: PRODUCT_EXPORT_COLUMNS,
        rows: selectedProducts,
        filename: exportFilename,
      }),
    [selectedProducts, exportFilename],
  );

  const exportOptions = useMemo(
    () => [
      { label: 'CSV', format: 'csv' as const, onClick: () => exportCsv(getExportData) },
      {
        label: 'Excel (.xls)',
        format: 'excel' as const,
        onClick: () => exportExcel(getExportData),
      },
      { label: 'PDF (stampa)', format: 'pdf' as const, onClick: () => exportPdf(getExportData) },
    ],
    [getExportData],
  );

  return (
    <div className="overflow-hidden rounded-md border">
      <div className="max-h-[400px] overflow-auto">
        <Table className="table-fixed">
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    style={{ width: header.getSize() }}
                    className="h-9 px-1"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-16 text-center text-sm text-muted-foreground"
                >
                  Nessun risultato
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  className={selectedIndices.has(row.original._index) ? 'bg-primary/5' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      key={cell.id}
                      style={{ width: cell.column.getSize() }}
                      className="px-1 py-0.5"
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <div className="border-t bg-muted/30 px-3 py-1 text-[10px] text-muted-foreground">
        {filteredCount} di {products.length} prodotti
      </div>
      <SelectionActionBar
        selectedCount={selectedProducts.length}
        actions={[]}
        exportOptions={exportOptions}
        onDeselect={onClearSelection}
        selectedLabel={`${selectedProducts.length} prodott${selectedProducts.length === 1 ? 'o' : 'i'} selezionat${selectedProducts.length === 1 ? 'o' : 'i'}`}
      />
    </div>
  );
}
