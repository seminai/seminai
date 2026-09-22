import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type SortDirection = 'asc' | 'desc' | false;

interface SortIndicatorProps {
  readonly direction: SortDirection;
  readonly className?: string;
}

export function SortIndicator({ direction, className }: SortIndicatorProps) {
  const iconClass = cn('h-3.5 w-3.5', className);

  if (direction === 'asc') return <ArrowUp className={iconClass} />;
  if (direction === 'desc') return <ArrowDown className={iconClass} />;
  return <ArrowUpDown className={cn(iconClass, 'text-muted-foreground/50')} />;
}
