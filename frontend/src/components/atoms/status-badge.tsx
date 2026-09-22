import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { STATUS_STYLES } from '@/config/constants';
import type { StatusKey } from '@/config/constants';

interface StatusBadgeProps {
  readonly status: string;
  readonly className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const normalizedStatus = status.toLowerCase() as StatusKey;
  const style = STATUS_STYLES[normalizedStatus] ?? STATUS_STYLES.caricato;

  return (
    <Badge
      variant="outline"
      className={cn('font-medium capitalize', style, className)}
    >
      {status}
    </Badge>
  );
}
