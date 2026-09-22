/** Mirrors of the backend sales-module DTOs used by the FE. */

export type PartnerType = 'CUSTOMER' | 'SUPPLIER';

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  CUSTOMER: 'Cliente',
  SUPPLIER: 'Fornitore',
};
export type SalesOrderStatus = 'DRAFT' | 'CONFIRMED' | 'FULFILLED' | 'CANCELLED';
export type DeliveryNoteStatus = 'GENERATED' | 'SENT' | 'CANCELLED';

export interface BusinessPartner {
  readonly id: string;
  readonly companyId: string;
  readonly type: PartnerType;
  readonly name: string;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly sdiCode: string | null;
  readonly pec: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly referent: string | null;
  readonly address: string | null;
  readonly city: string | null;
  readonly cap: string | null;
  readonly deliveryAddress: string | null;
  readonly deliveryNotesText: string | null;
  readonly deliveryHours: string | null;
  readonly followUpEnabled?: boolean;
  readonly isActive: boolean;
}

export interface CreateBusinessPartnerPayload {
  readonly companyId: string;
  readonly type: PartnerType;
  readonly name: string;
  readonly vatNumber?: string | null;
  readonly fiscalCode?: string | null;
  readonly sdiCode?: string | null;
  readonly pec?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly referent?: string | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly cap?: string | null;
  readonly deliveryAddress?: string | null;
  readonly deliveryNotesText?: string | null;
  readonly deliveryHours?: string | null;
}

export interface SalesOrderSummary {
  readonly order: {
    readonly id: string;
    readonly partnerId: string;
    readonly status: SalesOrderStatus;
    readonly orderDate: string;
  };
  readonly items: ReadonlyArray<{ readonly productId: string; readonly quantity: number }>;
}

export interface DeliveryNoteSummary {
  readonly deliveryNote: {
    readonly id: string;
    readonly number: number;
    readonly year: number;
    readonly status: DeliveryNoteStatus;
    readonly ddtDate: string;
    readonly customerSnapshot: { readonly name: string };
  };
  readonly items: ReadonlyArray<{ readonly productName: string; readonly quantity: number }>;
}

export type InvoiceStatus = 'OPEN' | 'OVERDUE' | 'PAID';

export interface InvoiceSummary {
  readonly id: string;
  readonly number: number;
  readonly year: number;
  readonly label: string;
  readonly invoiceDate: string;
  readonly dueDate: string;
  readonly totalAmount: number;
  readonly status: InvoiceStatus;
  readonly customerName: string;
  readonly deliveryNoteId: string | null;
  readonly paidAt: string | null;
  readonly lastReminderAt: string | null;
}
