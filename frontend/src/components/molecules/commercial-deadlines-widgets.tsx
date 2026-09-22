import { useTranslation } from 'react-i18next';
import { Package, Truck, Mail, AlertTriangle, Send } from 'lucide-react';
import { useCommercialDeadlines } from '@/hooks/use-commercial-deadlines';
import type { CommercialDeadlines } from '@/types/commercial';

const TILES = [
  { key: 'ordersToProcess', icon: Package, labelKey: 'home.commercial.widgets.ordersToProcess' },
  { key: 'outgoingDdt', icon: Truck, labelKey: 'home.commercial.widgets.outgoingDdt' },
  { key: 'pendingEmails', icon: Mail, labelKey: 'home.commercial.widgets.pendingEmails' },
  { key: 'overdueInvoices', icon: AlertTriangle, labelKey: 'home.commercial.widgets.overdueInvoices' },
  { key: 'followUpsSent', icon: Send, labelKey: 'home.commercial.widgets.followUpsSent' },
] as const satisfies ReadonlyArray<{
  key: keyof CommercialDeadlines;
  icon: typeof Package;
  labelKey: string;
}>;

/** Compact home dashboard tiles summarising pending commercial work. */
export function CommercialDeadlinesWidgets() {
  const { t } = useTranslation();
  const { deadlines } = useCommercialDeadlines();

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {TILES.map((tile) => (
        <div
          key={tile.key}
          className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-left"
        >
          <tile.icon className="h-5 w-5 text-muted-foreground" />
          <span className="text-2xl font-semibold tabular-nums">{deadlines[tile.key]}</span>
          <span className="text-xs text-muted-foreground">{t(tile.labelKey)}</span>
        </div>
      ))}
    </div>
  );
}
