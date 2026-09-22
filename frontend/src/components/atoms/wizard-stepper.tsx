import { cn } from '@/lib/utils';

interface WizardStepperProps {
  readonly steps: readonly string[];
  readonly currentIndex: number;
}

export function WizardStepper({ steps, currentIndex }: WizardStepperProps) {
  return (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {steps.map((label, index) => {
        const isActive = index === currentIndex;
        const isDone = index < currentIndex;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] font-semibold',
                isActive && 'border-primary bg-primary text-primary-foreground',
                isDone && 'border-primary/40 bg-primary/10 text-primary',
                !isActive && !isDone && 'border-border text-muted-foreground',
              )}
            >
              {index + 1}
            </span>
            <span className={cn(isActive ? 'font-medium' : 'text-muted-foreground')}>
              {label}
            </span>
            {index < steps.length - 1 && <span className="text-muted-foreground">›</span>}
          </li>
        );
      })}
    </ol>
  );
}
