import { SalesOrderStatus } from '@prisma/client';
import type { EmailIngestion } from '../../../domain/entities/EmailIngestion';
import type {
  CommercialInboxAction,
  CommercialInboxItemDto,
  CommercialInboxItemType,
  CommercialInboxPriority,
  CommercialInboxSourceChannel,
} from '../../../domain/dtos/commercial.dto';
import type { DeliveryNoteWithItems } from '../../../domain/repositories/IDeliveryNoteRepository';
import type { SalesInvoiceWithItems } from '../../../domain/repositories/ISalesInvoiceRepository';
import type { SalesOrderWithItems } from '../../../domain/repositories/ISalesOrderRepository';

const DAY_MS = 86_400_000;
export const DISPATCHED_WINDOW_MS = 7 * DAY_MS;

interface ItemTypeConfig {
  readonly priority: CommercialInboxPriority;
  readonly weight: number;
  readonly action: CommercialInboxAction;
  readonly ctaLabelKey: string;
}

const ITEM_CONFIG: Record<CommercialInboxItemType, ItemTypeConfig> = {
  SEND_COURIER_SUMMARY: {
    priority: 'HIGH',
    weight: 0,
    action: 'SEND_COURIER_SUMMARY',
    ctaLabelKey: 'commercial.inbox.cta.sendCourierSummary',
  },
  SEND_PAYMENT_REMINDER: {
    priority: 'HIGH',
    weight: 1,
    action: 'SEND_PAYMENT_REMINDER',
    ctaLabelKey: 'commercial.inbox.cta.sendPaymentReminder',
  },
  SHIP_TODAY: {
    priority: 'HIGH',
    weight: 2,
    action: 'OPEN_DDT_PRINT',
    ctaLabelKey: 'commercial.inbox.cta.shipDdt',
  },
  GENERATE_DDT: {
    priority: 'HIGH',
    weight: 3,
    action: 'OPEN_ORDER',
    ctaLabelKey: 'commercial.inbox.cta.generateDdt',
  },
  GENERATE_PROFORMA: {
    priority: 'HIGH',
    weight: 4,
    action: 'OPEN_ORDER',
    ctaLabelKey: 'commercial.inbox.cta.generateProforma',
  },
  REVIEW_ATTACHMENT: {
    priority: 'MEDIUM',
    weight: 5,
    action: 'OPEN_EMAIL_REVIEW',
    ctaLabelKey: 'commercial.inbox.cta.reviewAttachment',
  },
  PROCESS_ORDER: {
    priority: 'MEDIUM',
    weight: 6,
    action: 'OPEN_ORDER',
    ctaLabelKey: 'commercial.inbox.cta.processOrder',
  },
  OPEN_CHAT: {
    priority: 'LOW',
    weight: 7,
    action: 'OPEN_CHAT_THREAD',
    ctaLabelKey: 'commercial.inbox.cta.openChat',
  },
};

const ORDER_TITLES = {
  GENERATE_PROFORMA: 'Ordine bozza — genera proforma',
  PROCESS_ORDER: 'Ordine da confermare',
  GENERATE_DDT: 'Ordine confermato — genera DDT',
} as const;

const EMAIL_TITLES = {
  REVIEW_ATTACHMENT: 'Email da smistare',
  OPEN_CHAT: 'Email in elaborazione',
} as const;

function deriveSourceChannel(sourceRef: string | null): CommercialInboxSourceChannel | null {
  const prefix = sourceRef?.split(':')[0].toLowerCase();
  if (prefix === 'email') return 'EMAIL';
  if (prefix === 'whatsapp') return 'WHATSAPP';
  if (prefix === 'template') return 'TEMPLATE';
  if (prefix === 'chat') return 'CHAT';
  return null;
}

function resolveOrderType(status: SalesOrderStatus, hasProforma: boolean) {
  if (status === SalesOrderStatus.CONFIRMED) return 'GENERATE_DDT' as const;
  if (status === SalesOrderStatus.DRAFT) {
    return hasProforma ? ('PROCESS_ORDER' as const) : ('GENERATE_PROFORMA' as const);
  }
  return null;
}

interface BuildItemInput {
  readonly type: CommercialInboxItemType;
  readonly title: string;
  readonly subtitle: string | null;
  readonly partnerName: string | null;
  readonly companyId: string;
  readonly refId: string;
  readonly threadId: string | null;
  readonly createdAt: Date;
  readonly now: Date;
  readonly sourceChannel: CommercialInboxSourceChannel | null;
}

function buildItem(input: BuildItemInput): CommercialInboxItemDto {
  const config = ITEM_CONFIG[input.type];
  return {
    id: `${input.type}:${input.refId}`,
    type: input.type,
    priority: config.priority,
    title: input.title,
    subtitle: input.subtitle,
    partnerName: input.partnerName,
    companyId: input.companyId,
    refId: input.refId,
    threadId: input.threadId,
    createdAt: input.createdAt.toISOString(),
    ageDays: Math.max(0, Math.floor((input.now.getTime() - input.createdAt.getTime()) / DAY_MS)),
    action: config.action,
    ctaLabelKey: config.ctaLabelKey,
    sourceChannel: input.sourceChannel,
  };
}

export function mapOrder(
  entry: SalesOrderWithItems,
  partnerNames: ReadonlyMap<string, string>,
  proformaOrderIds: ReadonlySet<string>,
  now: Date,
): CommercialInboxItemDto | null {
  const { order, items } = entry;
  const type = resolveOrderType(order.status, proformaOrderIds.has(order.id));
  if (!type) return null;
  return buildItem({
    type,
    title: ORDER_TITLES[type],
    subtitle: `${items.length} righe`,
    partnerName: partnerNames.get(order.partnerId) ?? null,
    companyId: order.companyId,
    refId: order.id,
    threadId: null,
    createdAt: order.orderDate,
    now,
    sourceChannel: deriveSourceChannel(order.sourceRef),
  });
}

export function mapDeliveryNote(entry: DeliveryNoteWithItems, now: Date): CommercialInboxItemDto {
  const { deliveryNote, items } = entry;
  return buildItem({
    type: 'SHIP_TODAY',
    title: `DDT ${deliveryNote.label} da spedire`,
    subtitle: `${items.length} righe`,
    partnerName: deliveryNote.customerSnapshot.name,
    companyId: deliveryNote.companyId,
    refId: deliveryNote.id,
    threadId: null,
    createdAt: deliveryNote.ddtDate,
    now,
    sourceChannel: null,
  });
}

export function buildCourierSummaryItem(
  ddts: readonly DeliveryNoteWithItems[],
  companyId: string,
  now: Date,
): CommercialInboxItemDto | null {
  if (ddts.length === 0) return null;
  const packages = ddts.reduce((sum, entry) => sum + (entry.deliveryNote.packagesCount ?? 0), 0);
  const weight = ddts.reduce((sum, entry) => sum + (entry.deliveryNote.estimatedWeightKg ?? 0), 0);
  const oldest = ddts.reduce(
    (minimum, entry) =>
      entry.deliveryNote.ddtDate < minimum ? entry.deliveryNote.ddtDate : minimum,
    ddts[0].deliveryNote.ddtDate,
  );
  const parts = [`${ddts.length} DDT`];
  if (packages > 0) parts.push(`${packages} colli`);
  if (weight > 0) parts.push(`${weight} kg`);
  return buildItem({
    type: 'SEND_COURIER_SUMMARY',
    title: 'Spedizioni pronte — invia al corriere',
    subtitle: parts.join(' · '),
    partnerName: null,
    companyId,
    refId: companyId,
    threadId: null,
    createdAt: oldest,
    now,
    sourceChannel: null,
  });
}

export function mapOverdueInvoice(entry: SalesInvoiceWithItems, now: Date): CommercialInboxItemDto {
  const invoice = entry.salesInvoice;
  const due = invoice.dueDate.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  return buildItem({
    type: 'SEND_PAYMENT_REMINDER',
    title: `Fattura ${invoice.label} scaduta`,
    subtitle: `€ ${invoice.totalAmount.toFixed(2)} · scaduta il ${due}`,
    partnerName: invoice.customerSnapshot.name,
    companyId: invoice.companyId,
    refId: invoice.id,
    threadId: null,
    createdAt: invoice.dueDate,
    now,
    sourceChannel: null,
  });
}

export function mapEmail(
  ingestion: EmailIngestion,
  type: keyof typeof EMAIL_TITLES,
  companyId: string,
  now: Date,
): CommercialInboxItemDto {
  return buildItem({
    type,
    title: EMAIL_TITLES[type],
    subtitle: ingestion.subject ?? ingestion.fromAddress,
    partnerName: null,
    companyId,
    refId: ingestion.id,
    threadId: ingestion.threadId ?? null,
    createdAt: ingestion.receivedAt,
    now,
    sourceChannel: 'EMAIL',
  });
}

export function compareItems(a: CommercialInboxItemDto, b: CommercialInboxItemDto): number {
  const weightDiff = ITEM_CONFIG[a.type].weight - ITEM_CONFIG[b.type].weight;
  return weightDiff !== 0 ? weightDiff : b.ageDays - a.ageDays;
}

export function isItem(value: CommercialInboxItemDto | null): value is CommercialInboxItemDto {
  return value !== null;
}
