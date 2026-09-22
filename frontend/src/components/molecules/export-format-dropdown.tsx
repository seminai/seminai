import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { capture } from '@/lib/analytics';

export interface ExportFormatOption {
  readonly label: string;
  readonly format: 'csv' | 'excel' | 'pdf';
  readonly onClick: () => void;
}

interface ExportFormatDropdownProps {
  readonly options: readonly ExportFormatOption[];
  readonly triggerLabel: string;
  readonly triggerIcon?: React.ReactNode;
  readonly variant?: 'default' | 'destructive' | 'outline' | 'ghost';
  readonly size?: 'default' | 'sm' | 'lg' | 'icon';
  readonly className?: string;
  readonly align?: 'start' | 'center' | 'end';
  readonly side?: 'top' | 'right' | 'bottom' | 'left';
  readonly disabled?: boolean;
}

export function ExportFormatDropdown({
  options,
  triggerLabel,
  triggerIcon = <Download className="h-4 w-4" />,
  variant = 'ghost',
  size = 'sm',
  className,
  align = 'center',
  side = 'top',
  disabled = false,
}: ExportFormatDropdownProps) {
  if (options.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant={variant}
            size={size}
            className={cn('h-8 gap-1.5 text-sm', className)}
            disabled={disabled}
          />
        }
      >
        {triggerIcon}
        {triggerLabel}
      </PopoverTrigger>
      <PopoverContent className="w-40 p-1" align={align} side={side}>
        {options.map((opt) => (
          <Button
            key={opt.format}
            variant="ghost"
            size="sm"
            className="h-8 w-full justify-start gap-2 text-sm"
            onClick={() => {
              capture('export_requested', { format: opt.format });
              opt.onClick();
            }}
          >
            {opt.label}
          </Button>
        ))}
      </PopoverContent>
    </Popover>
  );
}
