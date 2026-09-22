import type { ReactNode } from 'react';
import { Info } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

type Side = 'top' | 'bottom' | 'left' | 'right';

interface InfoTooltipProps {
  readonly children: ReactNode;
  readonly title?: string;
  readonly side?: Side;
  readonly className?: string;
  readonly iconClassName?: string;
  readonly ariaLabel?: string;
}

export function InfoTooltip({
  children,
  title,
  side = 'bottom',
  className,
  iconClassName,
  ariaLabel = 'Mostra informazioni',
}: InfoTooltipProps) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button
            type="button"
            aria-label={ariaLabel}
            onClick={(event) => event.stopPropagation()}
            className={cn(
              'inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              className,
            )}
          />
        }
      >
        <Info className={cn('h-3.5 w-3.5', iconClassName)} />
      </PopoverTrigger>
      <PopoverContent side={side} className="w-72">
        {title ? (
          <PopoverHeader>
            <PopoverTitle>{title}</PopoverTitle>
          </PopoverHeader>
        ) : null}
        <div className="text-sm text-muted-foreground">{children}</div>
      </PopoverContent>
    </Popover>
  );
}
