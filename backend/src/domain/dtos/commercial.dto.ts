/**
 * Read DTOs for the commercial "what to do today" surface (Phase 0).
 * Mirrors the file-expiry/sales DTO style: plain interfaces, `readonly` fields,
 * string-literal unions (not TS enums) and ISO date strings for JSON safety.
 */

/** What kind of pending work a single inbox row represents. */
export type CommercialInboxItemType =
  | 'SEND_COURIER_SUMMARY' // ≥1 GENERATED DDT → email the courier the day's summary (aggregated)
  | 'SEND_PAYMENT_REMINDER' // overdue invoice → email the customer a payment reminder (per-invoice)
  | 'GENERATE_PROFORMA' // DRAFT order without a proforma yet → generate proforma
  | 'PROCESS_ORDER' // DRAFT order (proforma already sent) awaiting confirmation
  | 'GENERATE_DDT' // CONFIRMED order ready to ship → generate DDT
  | 'SHIP_TODAY' // GENERATED (not SENT) DDT → print/ship today
  | 'REVIEW_ATTACHMENT' // inbound email awaiting company disambiguation
  | 'OPEN_CHAT'; // recently dispatched email → agent thread awaiting review

/** Coarse priority bucket driving the badge colour and primary sort. */
export type CommercialInboxPriority = 'HIGH' | 'MEDIUM' | 'LOW';

/** The behaviour the FE attaches to a row CTA. */
export type CommercialInboxAction =
  | 'OPEN_ORDER'
  | 'OPEN_DDT_PRINT'
  | 'OPEN_CHAT_THREAD'
  | 'OPEN_EMAIL_REVIEW'
  | 'SEND_COURIER_SUMMARY'
  | 'SEND_PAYMENT_REMINDER';

/** Provenance of the item, surfaced as a badge. */
export type CommercialInboxSourceChannel = 'EMAIL' | 'WHATSAPP' | 'TEMPLATE' | 'CHAT';

/** A single actionable row in the operational inbox. */
export interface CommercialInboxItemDto {
  readonly id: string; // synthetic stable id: `${type}:${refId}`
  readonly type: CommercialInboxItemType;
  readonly priority: CommercialInboxPriority;
  readonly title: string; // server-rendered display text
  readonly subtitle: string | null;
  readonly partnerName: string | null;
  readonly companyId: string;
  readonly refId: string; // domain entity id (orderId / ddtId / ingestionId)
  readonly threadId: string | null; // present for email-originated items
  readonly createdAt: string; // ISO — source event time (orderDate / ddtDate / receivedAt)
  readonly ageDays: number; // floor((now - createdAt) / day), clamped at 0
  readonly action: CommercialInboxAction;
  readonly ctaLabelKey: string; // i18n key for the CTA button label
  readonly sourceChannel: CommercialInboxSourceChannel | null;
}

/** Envelope returned by `GET /commercial/inbox`. */
export interface CommercialInboxResponse {
  readonly items: readonly CommercialInboxItemDto[];
}

/** Widget counts returned by `GET /commercial/deadlines`. */
export interface CommercialDeadlinesDto {
  readonly ordersToProcess: number; // SalesOrder in (DRAFT, CONFIRMED)
  readonly outgoingDdt: number; // DeliveryNote in GENERATED
  readonly overdueInvoices: number; // stubbed 0 until the payments phase
  readonly pendingEmails: number; // EmailIngestion AWAITING_DISAMBIGUATION
  readonly followUpsSent: number; // customers reminded in the last 7 days (Phase 4b)
}
