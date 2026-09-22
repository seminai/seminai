import { Printer } from 'lucide-react';
import {
  ExportFormatDropdown,
  type ExportFormatOption,
} from '@/components/molecules/export-format-dropdown';

interface PrintOperationsButtonProps {
  readonly count: number;
  readonly exportOptions: readonly ExportFormatOption[];
}

function formatOperationsLabel(count: number): string {
  const noun = count === 1 ? 'operazione' : 'operazioni';
  return `Stampa ${count} ${noun}`;
}

export function PrintOperationsButton({
  count,
  exportOptions,
}: PrintOperationsButtonProps) {
  return (
    <ExportFormatDropdown
      options={exportOptions}
      triggerLabel={formatOperationsLabel(count)}
      triggerIcon={<Printer className="h-4 w-4" />}
      variant="outline"
      align="end"
      side="bottom"
      disabled={count === 0}
    />
  );
}
