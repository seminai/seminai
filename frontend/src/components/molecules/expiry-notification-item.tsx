import { ExpirySeverityIcon } from '@/components/atoms/expiry-severity-icon';
import type { ExpiryNotification } from '@/types/workspace';

interface ExpiryNotificationItemProps {
  readonly notification: ExpiryNotification;
  readonly onClick?: (notification: ExpiryNotification) => void;
}

const SEVERITY_BG = {
  critical: 'bg-red-50 border-red-200 hover:bg-red-100/70',
  warning: 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100/70',
  info: 'bg-blue-50 border-blue-200 hover:bg-blue-100/70',
} as const;

export function ExpiryNotificationItem({ notification, onClick }: ExpiryNotificationItemProps) {
  return (
    <button
      type="button"
      className={`flex w-full items-start gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors ${SEVERITY_BG[notification.severity]}`}
      onClick={() => onClick?.(notification)}
    >
      <ExpirySeverityIcon severity={notification.severity} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{notification.titolo}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{notification.scadenza}</span>
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">{notification.message}</p>
      </div>
    </button>
  );
}
