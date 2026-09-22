import { cn } from '@/lib/utils';

interface TypingIndicatorProps {
  readonly className?: string;
}

const DOT_BASE = 'inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/60';

export function TypingIndicator({ className }: TypingIndicatorProps) {
  return (
    <span
      className={cn('inline-flex items-center gap-1 align-middle', className)}
      aria-label="L'agente sta scrivendo"
      role="status"
    >
      <span className={cn(DOT_BASE, 'animate-bounce [animation-delay:-0.3s]')} />
      <span className={cn(DOT_BASE, 'animate-bounce [animation-delay:-0.15s]')} />
      <span className={cn(DOT_BASE, 'animate-bounce')} />
    </span>
  );
}
