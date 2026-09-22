import { cn } from '@/lib/utils';
import type { CommercialInboxSourceChannel } from '@/types/commercial';

interface SourceChannelBadgeProps {
  readonly channel: CommercialInboxSourceChannel;
  readonly className?: string;
}

interface ChannelMeta {
  readonly label: string;
  readonly className: string;
}

const META: Readonly<Record<CommercialInboxSourceChannel, ChannelMeta>> = {
  EMAIL: {
    label: 'Email',
    className: 'bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200',
  },
  WHATSAPP: {
    label: 'WhatsApp',
    className: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200',
  },
  TEMPLATE: {
    label: 'Modello',
    className: 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200',
  },
  CHAT: {
    label: 'Chat',
    className: 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200',
  },
};

/** Small pill showing the provenance (channel) of a commercial inbox item. */
export function SourceChannelBadge({ channel, className }: SourceChannelBadgeProps) {
  const meta = META[channel];
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}
