import type { VerificationStatusTone } from '@/components/organisms/jobs/job-verification-status';

interface LegendEntry {
  readonly tone: VerificationStatusTone;
  readonly label: string;
  readonly shortcode?: string;
  readonly description: string;
}

const LEGEND_ENTRIES: readonly LegendEntry[] = [
  {
    tone: 'green',
    label: 'Verificata',
    description: 'Operazione controllata e confermata.',
  },
  {
    tone: 'red',
    label: 'Non verificata',
    shortcode: 'N/V',
    description: 'Conformità analizzata ma non ancora validata.',
  },
  {
    tone: 'yellow',
    label: 'Conformità non verificata',
    description: 'Operazione creata o modificata, in attesa di controllo conformità.',
  },
];

const TONE_DOT_CLASSES: Record<VerificationStatusTone, string> = {
  green: 'bg-emerald-500',
  red: 'bg-red-500',
  yellow: 'bg-amber-500',
};

export function VerificationStatusLegend() {
  return (
    <ul className="flex flex-col gap-2">
      {LEGEND_ENTRIES.map((entry) => (
        <li key={entry.label} className="flex items-start gap-2">
          <span
            aria-hidden="true"
            className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${TONE_DOT_CLASSES[entry.tone]}`}
          />
          <div className="min-w-0 text-xs leading-snug">
            <span className="font-medium text-foreground">
              {entry.label}
              {entry.shortcode ? (
                <span className="ml-1 font-normal text-muted-foreground">
                  ({entry.shortcode})
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground"> — {entry.description}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}
