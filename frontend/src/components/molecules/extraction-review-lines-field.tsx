import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { ExtractionFieldDescriptor } from '@/lib/agent-chat-events';

interface ExtractionReviewLinesFieldProps {
  readonly descriptor: ExtractionFieldDescriptor;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
  readonly disabled?: boolean;
}

type Row = Record<string, unknown>;

function asRows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((r): r is Row => typeof r === 'object' && r !== null && !Array.isArray(r));
}

function asInputValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function ExtractionReviewLinesField({
  descriptor,
  value,
  onChange,
  disabled,
}: ExtractionReviewLinesFieldProps) {
  const rows = asRows(value);
  const columns = descriptor.lineFields ?? [];

  function updateCell(rowIndex: number, key: string, raw: string, type: string): void {
    const nextRow: Row = { ...rows[rowIndex] };
    if (raw === '') {
      delete nextRow[key];
    } else if (type === 'number') {
      const parsed = Number(raw);
      nextRow[key] = Number.isFinite(parsed) ? parsed : raw;
    } else {
      nextRow[key] = raw;
    }
    const nextRows = [...rows];
    nextRows[rowIndex] = nextRow;
    onChange(nextRows);
  }

  function addRow(): void {
    onChange([...rows, {}]);
  }

  function removeRow(rowIndex: number): void {
    onChange(rows.filter((_, i) => i !== rowIndex));
  }

  return (
    <div className="col-span-1 space-y-2 md:col-span-2">
      <Label className="text-xs font-medium">
        {descriptor.labelIt} <span className="text-muted-foreground">({rows.length})</span>
      </Label>
      <div className="overflow-x-auto rounded-md border border-border bg-background">
        <table className="w-full text-[11px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">#</th>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-1.5 text-left font-medium text-muted-foreground"
                >
                  {col.labelIt}
                </th>
              ))}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="px-2 py-3 text-center text-muted-foreground"
                >
                  Nessuna riga
                </td>
              </tr>
            )}
            {rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="border-t border-border/60">
                <td className="px-2 py-1 align-top text-muted-foreground">{rowIndex + 1}</td>
                {columns.map((col) => (
                  <td key={col.key} className="px-1 py-1 align-top">
                    <Input
                      type={col.type === 'date' ? 'date' : col.type === 'number' ? 'number' : 'text'}
                      value={asInputValue(row[col.key])}
                      onChange={(e) => updateCell(rowIndex, col.key, e.target.value, col.type)}
                      disabled={disabled}
                      placeholder={col.placeholder}
                      className="h-7 text-[11px]"
                    />
                  </td>
                ))}
                <td className="px-1 py-1 align-top text-right">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => removeRow(rowIndex)}
                    disabled={disabled}
                    className="h-7 w-7"
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={addRow}
        disabled={disabled}
        className="h-7 text-[11px]"
      >
        <Plus className="mr-1 h-3 w-3" />
        Aggiungi riga
      </Button>
    </div>
  );
}
