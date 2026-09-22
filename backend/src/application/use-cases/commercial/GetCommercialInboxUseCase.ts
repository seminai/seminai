import { DeliveryNoteStatus, EmailIngestionStatus, SalesOrderStatus } from '@prisma/client';
import {
  type ISalesOrderRepository,
  type SalesOrderWithItems,
} from '../../../domain/repositories/ISalesOrderRepository';
import {
  type IDeliveryNoteRepository,
  type DeliveryNoteWithItems,
} from '../../../domain/repositories/IDeliveryNoteRepository';
import { type IEmailIngestionRepository } from '../../../domain/repositories/IEmailIngestionRepository';
import { type IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { type IProformaInvoiceRepository } from '../../../domain/repositories/IProformaInvoiceRepository';
import {
  type ISalesInvoiceRepository,
  type SalesInvoiceWithItems,
} from '../../../domain/repositories/ISalesInvoiceRepository';
import { type EmailIngestion } from '../../../domain/entities/EmailIngestion';
import {
  type CommercialInboxAction,
  type CommercialInboxItemDto,
  type CommercialInboxItemType,
  type CommercialInboxPriority,
  type CommercialInboxResponse,
  type CommercialInboxSourceChannel,
} from '../../../domain/dtos/commercial.dto';

/** Derives the source-channel badge from a SalesOrder.sourceRef prefix. */
function deriveSourceChannel(sourceRef: string | null): CommercialInboxSourceChannel | null {
  if (!sourceRef) return null;
  const prefix = sourceRef.split(':')[0].toLowerCase();
  if (prefix === 'email') return 'EMAIL';
  if (prefix === 'whatsapp') return 'WHATSAPP';
  if (prefix === 'template') return 'TEMPLATE';
  if (prefix === 'chat') return 'CHAT';
  return null;
}

const DAY_MS = 86_400_000;
/** Only surface dispatched emails received within this recency window. */
const DISPATCHED_WINDOW_MS = 7 * DAY_MS;

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

const ORDER_TITLES: Record<'GENERATE_PROFORMA' | 'PROCESS_ORDER' | 'GENERATE_DDT', string> = {
  GENERATE_PROFORMA: 'Ordine bozza — genera proforma',
  PROCESS_ORDER: 'Ordine da confermare',
  GENERATE_DDT: 'Ordine confermato — genera DDT',
};

function resolveOrderType(
  status: SalesOrderStatus,
  hasProforma: boolean,
): 'GENERATE_PROFORMA' | 'PROCESS_ORDER' | 'GENERATE_DDT' | null {
  if (status === SalesOrderStatus.CONFIRMED) return 'GENERATE_DDT';
  if (status === SalesOrderStatus.DRAFT) return hasProforma ? 'PROCESS_ORDER' : 'GENERATE_PROFORMA';
  return null;
}

const EMAIL_TITLES: Record<'REVIEW_ATTACHMENT' | 'OPEN_CHAT', string> = {
  REVIEW_ATTACHMENT: 'Email da smistare',
  OPEN_CHAT: 'Email in elaborazione',
};

function computeAgeDays(createdAt: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / DAY_MS));
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
    ageDays: computeAgeDays(input.createdAt, input.now),
    action: config.action,
    ctaLabelKey: config.ctaLabelKey,
    sourceChannel: input.sourceChannel,
  };
}

function mapOrder(
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

function mapDeliveryNote(entry: DeliveryNoteWithItems, now: Date): CommercialInboxItemDto {
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

/**
 * Builds the single aggregated "send the courier summary" row from the company's
 * pending (GENERATED) DDTs. Returns null when there is nothing to ship.
 */
function buildCourierSummaryItem(
  ddts: readonly DeliveryNoteWithItems[],
  companyId: string,
  now: Date,
): CommercialInboxItemDto | null {
  if (ddts.length === 0) return null;
  const packages = ddts.reduce((sum, entry) => sum + (entry.deliveryNote.packagesCount ?? 0), 0);
  const weight = ddts.reduce((sum, entry) => sum + (entry.deliveryNote.estimatedWeightKg ?? 0), 0);
  const oldest = ddts.reduce(
    (min, entry) => (entry.deliveryNote.ddtDate < min ? entry.deliveryNote.ddtDate : min),
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

function mapOverdueInvoice(entry: SalesInvoiceWithItems, now: Date): CommercialInboxItemDto {
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

function mapEmail(
  ingestion: EmailIngestion,
  type: 'REVIEW_ATTACHMENT' | 'OPEN_CHAT',
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

function compareItems(a: CommercialInboxItemDto, b: CommercialInboxItemDto): number {
  const weightDiff = ITEM_CONFIG[a.type].weight - ITEM_CONFIG[b.type].weight;
  return weightDiff !== 0 ? weightDiff : b.ageDays - a.ageDays;
}

function isItem(value: CommercialInboxItemDto | null): value is CommercialInboxItemDto {
  return value !== null;
}

export interface GetCommercialInboxParams {
  readonly companyId: string;
  readonly now?: Date;
}

/**
 * Aggregates the company's pending commercial work (orders to process, DDT to
 * ship, emails to review) into a single priority-sorted inbox. Read-only.
 */
export class GetCommercialInboxUseCase {
  constructor(
    private readonly salesOrderRepository: ISalesOrderRepository,
    private readonly deliveryNoteRepository: IDeliveryNoteRepository,
    private readonly emailIngestionRepository: IEmailIngestionRepository,
    private readonly businessPartnerRepository: IBusinessPartnerRepository,
    private readonly proformaInvoiceRepository: IProformaInvoiceRepository,
    private readonly salesInvoiceRepository: ISalesInvoiceRepository,
  ) {}

  async execute(params: GetCommercialInboxParams): Promise<CommercialInboxResponse> {
    const now = params.now ?? new Date();
    const since = new Date(now.getTime() - DISPATCHED_WINDOW_MS);
    const [orders, ddts, awaitingEmails, dispatchedEmails, partners, proformaOrderIds, overdue] =
      await Promise.all([
        this.salesOrderRepository.findManyByCompany(params.companyId),
        this.deliveryNoteRepository.findManyByCompany(params.companyId, {
          status: DeliveryNoteStatus.GENERATED,
        }),
        this.emailIngestionRepository.findManyByCompany({
          companyId: params.companyId,
          statuses: [EmailIngestionStatus.AWAITING_DISAMBIGUATION],
        }),
        this.emailIngestionRepository.findManyByCompany({
          companyId: params.companyId,
          statuses: [EmailIngestionStatus.DISPATCHED],
          since,
        }),
        this.businessPartnerRepository.findManyByCompany(params.companyId),
        this.proformaInvoiceRepository.findOrderIdsByCompany(params.companyId),
        this.salesInvoiceRepository.findOverdueByCompany(params.companyId, now),
      ]);
    const partnerNames = new Map(partners.map((partner) => [partner.id, partner.name]));
    const proformaSet = new Set(proformaOrderIds);
    const courierSummary = buildCourierSummaryItem(ddts, params.companyId, now);
    const items = [
      ...(courierSummary ? [courierSummary] : []),
      ...overdue.map((invoice) => mapOverdueInvoice(invoice, now)),
      ...ddts.map((ddt) => mapDeliveryNote(ddt, now)),
      ...orders.map((order) => mapOrder(order, partnerNames, proformaSet, now)).filter(isItem),
      ...awaitingEmails.map((email) => mapEmail(email, 'REVIEW_ATTACHMENT', params.companyId, now)),
      ...dispatchedEmails.map((email) => mapEmail(email, 'OPEN_CHAT', params.companyId, now)),
    ].sort(compareItems);
    return { items };
  }
}
