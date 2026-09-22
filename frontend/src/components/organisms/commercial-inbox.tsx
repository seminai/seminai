import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { SourceChannelBadge } from '@/components/atoms/source-channel-badge';
import { useCommercialInbox } from '@/hooks/use-commercial-inbox';
import { useTabs } from '@/hooks/use-tabs';
import { useDosageChatsQuery } from '@/hooks/use-dosage-chat';
import {
  deliveryNotePrintUrl,
  proformaPrintUrl,
  useConfirmOrder,
  useGenerateDeliveryNote,
  useGenerateProforma,
  useSendCourierSummary,
  useSendPaymentReminder,
} from '@/hooks/use-sales';
import { buildChatTabTitle } from '@/lib/chat-tab-format';
import type {
  CommercialInboxItemEnriched,
  CommercialInboxItemType,
  CommercialInboxPriority,
} from '@/types/commercial';

const PRIORITY_DOT: Record<CommercialInboxPriority, string> = {
  HIGH: 'bg-red-500',
  MEDIUM: 'bg-amber-500',
  LOW: 'bg-muted-foreground',
};

/** Types whose CTA opens a one-click confirm dialog (vs print/chat navigation). */
const CONFIRM_TYPES = new Set<CommercialInboxItemType>([
  'GENERATE_PROFORMA',
  'PROCESS_ORDER',
  'GENERATE_DDT',
  'SEND_COURIER_SUMMARY',
  'SEND_PAYMENT_REMINDER',
]);

const CONFIRM_KEY: Partial<Record<CommercialInboxItemType, string>> = {
  GENERATE_PROFORMA: 'commercial.inbox.confirm.generateProforma',
  PROCESS_ORDER: 'commercial.inbox.confirm.processOrder',
  GENERATE_DDT: 'commercial.inbox.confirm.generateDdt',
  SEND_COURIER_SUMMARY: 'commercial.inbox.confirm.sendCourierSummary',
  SEND_PAYMENT_REMINDER: 'commercial.inbox.confirm.sendPaymentReminder',
};

function openPrint(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

function formatAge(ageDays: number, t: TFunction): string {
  return ageDays <= 0
    ? t('commercial.inbox.age.today')
    : t('commercial.inbox.age.days', { count: ageDays });
}

function buildRowMeta(item: CommercialInboxItemEnriched, t: TFunction): string {
  const parts = [item.partnerName, item.subtitle, item.companyName].filter(Boolean) as string[];
  return [parts.join(' · '), formatAge(item.ageDays, t)].filter(Boolean).join(' — ');
}

/** Home "what to do today" list: approve-only order flow + outgoing DDT + emails. */
export function CommercialInbox() {
  const { t } = useTranslation();
  const { items, isLoading } = useCommercialInbox();
  const { addTab, setActiveView } = useTabs();
  const chatsQuery = useDosageChatsQuery();
  const chats = useMemo(() => chatsQuery.data?.data ?? [], [chatsQuery.data]);

  const generateProforma = useGenerateProforma();
  const confirmOrder = useConfirmOrder();
  const generateDdt = useGenerateDeliveryNote();
  const sendCourierSummary = useSendCourierSummary();
  const sendPaymentReminder = useSendPaymentReminder();
  const isMutating =
    generateProforma.isPending ||
    confirmOrder.isPending ||
    generateDdt.isPending ||
    sendCourierSummary.isPending ||
    sendPaymentReminder.isPending;

  const [confirmItem, setConfirmItem] = useState<CommercialInboxItemEnriched | null>(null);

  const handleNavigate = useCallback(
    (item: CommercialInboxItemEnriched) => {
      if (item.action === 'OPEN_DDT_PRINT') {
        openPrint(deliveryNotePrintUrl(item.refId));
        return;
      }
      const chat = item.threadId ? chats.find((c) => c.threadId === item.threadId) : undefined;
      if (chat) {
        addTab({
          id: chat.id,
          title: buildChatTabTitle({ message: item.subtitle ?? undefined }),
          format: '-',
          source: 'chat',
        });
        return;
      }
      setActiveView('chat');
    },
    [chats, addTab, setActiveView],
  );

  const handleCtaClick = useCallback(
    (item: CommercialInboxItemEnriched) => {
      if (CONFIRM_TYPES.has(item.type)) {
        setConfirmItem(item);
        return;
      }
      handleNavigate(item);
    },
    [handleNavigate],
  );

  const handleConfirm = useCallback(() => {
    const item = confirmItem;
    setConfirmItem(null);
    if (!item) return;
    if (item.type === 'SEND_COURIER_SUMMARY') {
      sendCourierSummary.mutate(
        { companyId: item.companyId },
        {
          onSuccess: (data) =>
            toast.success(t('commercial.inbox.toast.courierSent', { count: data.sent })),
          onError: () => toast.error(t('commercial.inbox.toast.courierError')),
        },
      );
      return;
    }
    if (item.type === 'SEND_PAYMENT_REMINDER') {
      sendPaymentReminder.mutate(
        { invoiceId: item.refId, companyId: item.companyId },
        {
          onSuccess: () => toast.success(t('commercial.inbox.toast.reminderSent')),
          onError: () => toast.error(t('commercial.inbox.toast.reminderError')),
        },
      );
      return;
    }
    const vars = { orderId: item.refId, companyId: item.companyId };
    if (item.type === 'GENERATE_PROFORMA') {
      generateProforma.mutate(vars, {
        onSuccess: (data) => openPrint(proformaPrintUrl(data.proformaInvoice.id)),
      });
      return;
    }
    if (item.type === 'GENERATE_DDT') {
      generateDdt.mutate(vars, {
        onSuccess: (data) => openPrint(deliveryNotePrintUrl(data.deliveryNote.id)),
      });
      return;
    }
    confirmOrder.mutate(vars);
  }, [
    confirmItem,
    generateProforma,
    generateDdt,
    confirmOrder,
    sendCourierSummary,
    sendPaymentReminder,
    t,
  ]);

  return (
    <>
      <Card size="sm">
        <div className="flex flex-col gap-1 px-4 py-3">
          {isLoading && (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('home.commercial.loading')}
            </div>
          )}
          {!isLoading && items.length === 0 && (
            <p className="py-3 text-sm text-muted-foreground">{t('home.commercial.empty')}</p>
          )}
          {items.map((item) => (
            <div
              key={item.id}
              className="flex items-center gap-3 rounded-lg px-2 py-2.5 text-left text-sm"
            >
              <span className={cn('h-2 w-2 shrink-0 rounded-full', PRIORITY_DOT[item.priority])} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{item.title}</p>
                  {item.sourceChannel && <SourceChannelBadge channel={item.sourceChannel} />}
                </div>
                <p className="truncate text-xs text-muted-foreground">{buildRowMeta(item, t)}</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={isMutating}
                onClick={() => handleCtaClick(item)}
              >
                {t(item.ctaLabelKey)}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Dialog open={confirmItem !== null} onOpenChange={(open) => !open && setConfirmItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirmItem?.title}</DialogTitle>
            <DialogDescription>
              {confirmItem ? t(CONFIRM_KEY[confirmItem.type] ?? 'commercial.inbox.confirm.processOrder') : ''}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmItem(null)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleConfirm}>{t('common.confirm')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
