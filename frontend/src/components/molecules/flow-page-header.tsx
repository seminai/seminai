import type { NavigateOptions } from '@tanstack/react-router';
import { BackButton } from '@/components/molecules/back-button';

interface FlowPageHeaderProps {
  readonly fallback: NavigateOptions;
  readonly title: string;
  readonly subtitle?: string;
}

/** Bordered header row for flow screens: back button top-left, then title. */
export function FlowPageHeader({ fallback, title, subtitle }: FlowPageHeaderProps) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b px-6 py-4">
      <BackButton fallback={fallback} />
      <div>
        <h1 className="text-lg font-semibold">{title}</h1>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}
