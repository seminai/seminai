import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type JobDetailToggleTone = 'default' | 'amber' | 'red';

interface JobDetailToggleSectionProps {
  readonly title: string;
  readonly icon: LucideIcon;
  readonly tone?: JobDetailToggleTone;
  /** Red alert dot next to title (e.g. stock / exclusion). */
  readonly showAlertDot?: boolean;
  readonly defaultOpen?: boolean;
  readonly children: ReactNode;
}

export function JobDetailToggleSection({
  title,
  icon: Icon,
  tone = 'default',
  showAlertDot = false,
  defaultOpen = false,
  children,
}: JobDetailToggleSectionProps) {
  const toneClass =
    tone === 'amber'
      ? 'text-amber-700 [&_svg]:text-amber-600'
      : tone === 'red'
        ? 'text-red-700 [&_svg]:text-red-600'
        : 'text-foreground [&_svg]:text-muted-foreground';

  return (
    <details
      className="group border-b border-border/70 last:border-b-0"
      {...(defaultOpen ? { open: true } : {})}
    >
      <summary
        className={cn(
          'flex cursor-pointer list-none items-center gap-3 py-4 pr-1 transition-colors hover:bg-muted/30',
          '[&::-webkit-details-marker]:hidden',
          toneClass,
        )}
      >
        <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
        <span className="min-w-0 flex-1 text-left text-[1.05rem] font-semibold">
          {title}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {showAlertDot ? (
            <span className="size-2 rounded-full bg-red-500" title="Richiede attenzione" aria-hidden />
          ) : null}
          <ChevronDown
            className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </div>
      </summary>
      <div className="border-t border-border/50 bg-muted/10 px-1 py-3 sm:px-2">{children}</div>
    </details>
  );
}
