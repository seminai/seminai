/** Mirrors of the backend commercial-module read DTOs used by the FE. */

export type CommercialInboxItemType =
  | 'SEND_COURIER_SUMMARY'
  | 'SEND_PAYMENT_REMINDER'
  | 'GENERATE_PROFORMA'
  | 'PROCESS_ORDER'
  | 'GENERATE_DDT'
  | 'SHIP_TODAY'
  | 'REVIEW_ATTACHMENT'
  | 'OPEN_CHAT';

export type CommercialInboxPriority = 'HIGH' | 'MEDIUM' | 'LOW';

export type CommercialInboxAction =
  | 'OPEN_ORDER'
  | 'OPEN_DDT_PRINT'
  | 'OPEN_CHAT_THREAD'
  | 'OPEN_EMAIL_REVIEW'
  | 'SEND_COURIER_SUMMARY'
  | 'SEND_PAYMENT_REMINDER';

export type CommercialInboxSourceChannel = 'EMAIL' | 'WHATSAPP' | 'TEMPLATE' | 'CHAT';

export interface CommercialInboxItem {
  readonly id: string;
  readonly type: CommercialInboxItemType;
  readonly priority: CommercialInboxPriority;
  readonly title: string;
  readonly subtitle: string | null;
  readonly partnerName: string | null;
  readonly companyId: string;
  readonly refId: string;
  readonly threadId: string | null;
  readonly createdAt: string;
  readonly ageDays: number;
  readonly action: CommercialInboxAction;
  readonly ctaLabelKey: string;
  readonly sourceChannel: CommercialInboxSourceChannel | null;
}

/** FE-enriched item carrying the company display name (like ExpiringFile). */
export interface CommercialInboxItemEnriched extends CommercialInboxItem {
  readonly companyName: string;
}

export interface CommercialDeadlines {
  readonly ordersToProcess: number;
  readonly outgoingDdt: number;
  readonly overdueInvoices: number;
  readonly pendingEmails: number;
  readonly followUpsSent: number;
}
