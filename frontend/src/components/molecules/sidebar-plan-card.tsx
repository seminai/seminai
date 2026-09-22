import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Button } from '@/components/ui/button';
import { ChevronUp, CreditCard } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getPlanLabel, type WorkspacePlan } from '@/types/workspace';

interface SidebarPlanCardProps {
  readonly plan?: WorkspacePlan | string | null;
  readonly collapsed?: boolean;
}

export function SidebarPlanCard({ plan, collapsed }: SidebarPlanCardProps) {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();
  const label = getPlanLabel(plan ?? null);

  const goToPlanSettings = () => {
    void navigate({ to: '/settings', search: { section: 'plan' } });
  };

  if (collapsed) {
    return (
      <button
        title={`Piano: ${label}`}
        onClick={goToPlanSettings}
        className="flex w-full items-center justify-center rounded-lg px-2 py-2 text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
      >
        <CreditCard className="h-5 w-5" />
      </button>
    );
  }

  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <button
        className="flex w-full items-center justify-between"
        onClick={() => setExpanded((prev) => !prev)}
      >
        <span className="text-sm font-medium">Utilizzo del piano</span>
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
            {label}
          </span>
          <ChevronUp
            className={cn(
              'h-3.5 w-3.5 text-muted-foreground transition-transform',
              !expanded && 'rotate-180',
            )}
          />
        </div>
      </button>
      {expanded && (
        <div className="mt-3">
          <Button className="w-full" size="sm" onClick={goToPlanSettings}>
            Aggiorna
          </Button>
        </div>
      )}
    </div>
  );
}
