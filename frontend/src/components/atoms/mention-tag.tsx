import { cn } from '@/lib/utils';

interface MentionTagProps {
  readonly text: string;
  readonly className?: string;
}

export function MentionTag({ text, className }: MentionTagProps) {
  const parts = text.split(/(@\w+)/g);

  return (
    <span className={cn('text-sm text-muted-foreground', className)}>
      {parts.map((part, i) =>
        part.startsWith('@') ? (
          <span key={i} className="font-medium text-primary">
            {part}
          </span>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </span>
  );
}
