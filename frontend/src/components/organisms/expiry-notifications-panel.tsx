import { Bell } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { ExpiryNotificationItem } from '@/components/molecules/expiry-notification-item';
import type { ExpiryNotification } from '@/types/workspace';

interface ExpiryNotificationsPanelProps {
  readonly notifications: readonly ExpiryNotification[];
  readonly onNotificationClick?: (notification: ExpiryNotification) => void;
}

export function ExpiryNotificationsPanel({
  notifications,
  onNotificationClick,
}: ExpiryNotificationsPanelProps) {
  if (notifications.length === 0) return null;

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-muted-foreground" />
          Scadenze e notifiche
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({notifications.length})
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {notifications.map((n) => (
          <ExpiryNotificationItem
            key={n.id}
            notification={n}
            onClick={onNotificationClick}
          />
        ))}
      </CardContent>
    </Card>
  );
}
