import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface AddDataOptionCardProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description: string;
  readonly onClick: () => void;
  /** 'compact' shrinks paddings and typography so 5 cards fit on one row. */
  readonly variant?: 'default' | 'compact';
}

export function AddDataOptionCard({
  icon: Icon,
  title,
  description,
  onClick,
  variant = 'default',
}: AddDataOptionCardProps) {
  const compact = variant === 'compact';
  return (
    <Card
      className={cn(
        'cursor-pointer transition-colors hover:border-primary/50 hover:bg-accent/50',
        'flex flex-col items-center justify-center text-center',
        compact ? 'p-4' : 'p-8',
      )}
      onClick={onClick}
    >
      <CardContent className={cn('flex flex-col items-center p-0', compact ? 'gap-3' : 'gap-4')}>
        <div
          className={cn(
            'flex items-center justify-center rounded-xl bg-primary/10',
            compact ? 'h-10 w-10' : 'h-16 w-16',
          )}
        >
          <Icon className={cn('text-primary', compact ? 'h-5 w-5' : 'h-8 w-8')} />
        </div>
        <div>
          <h3 className={cn('font-semibold', compact ? 'text-sm' : 'text-lg')}>{title}</h3>
          <p
            className={cn(
              'mt-1 text-muted-foreground',
              compact ? 'text-xs line-clamp-3' : 'text-sm',
            )}
          >
            {description}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
