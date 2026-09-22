import type { DocumentCategory } from '@/types/prisma';
import { cn } from '@/lib/utils';

interface DocumentBadgeProps {
  readonly category: DocumentCategory;
  readonly className?: string;
}

interface CategoryMeta {
  readonly labelIt: string;
  readonly className: string;
}

const META: Readonly<Record<DocumentCategory, CategoryMeta>> = {
  DDT: { labelIt: 'DDT', className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200' },
  DISCIPLINARE: {
    labelIt: 'Disciplinare',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200',
  },
  FASCICOLO_AZIENDALE: {
    labelIt: 'Fascicolo Aziendale',
    className: 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
  },
  FATTURA: {
    labelIt: 'Fattura',
    className: 'bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200',
  },
  MAGAZZINO: {
    labelIt: 'Magazzino',
    className: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-200',
  },
  ETICHETTA: {
    labelIt: 'Etichetta',
    className: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200',
  },
  VISURA_AZIENDALE: {
    labelIt: 'Visura Aziendale',
    className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  },
  NOTA: {
    labelIt: 'Nota',
    className: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  },
  PIANO_COLTURALE: {
    labelIt: 'Piano Colturale',
    className: 'bg-lime-100 text-lime-800 dark:bg-lime-950 dark:text-lime-200',
  },
  CERTIFICAZIONE: {
    labelIt: 'Certificazione',
    className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  },
  ALTRO: {
    labelIt: 'Altro',
    className: 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200',
  },
};

export function DocumentBadge({ category, className }: DocumentBadgeProps) {
  const meta = META[category];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        meta.className,
        className,
      )}
    >
      {meta.labelIt}
    </span>
  );
}
