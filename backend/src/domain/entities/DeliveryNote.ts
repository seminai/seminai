import { DeliveryNote as PrismaDeliveryNote, DeliveryNoteStatus } from '@prisma/client';
import { CustomerSnapshot } from '../dtos/delivery-note.dto';

/** Immutable shape of a DDT header. */
export interface DeliveryNoteProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderId: string | null;
  readonly number: number;
  readonly year: number;
  readonly ddtDate: Date;
  readonly status: DeliveryNoteStatus;
  readonly causale: string | null;
  readonly carrier: string | null;
  readonly packagesCount: number | null;
  readonly estimatedWeightKg: number | null;
  readonly deliveryNotesText: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly htmlUrl: string | null;
  readonly sentAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * DDT (documento di trasporto). Progressive numbering per (companyId, year)
 * and a frozen `customerSnapshot` keep generated documents immutable.
 */
export class DeliveryNote implements DeliveryNoteProps {
  readonly id: string;
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderId: string | null;
  readonly number: number;
  readonly year: number;
  readonly ddtDate: Date;
  readonly status: DeliveryNoteStatus;
  readonly causale: string | null;
  readonly carrier: string | null;
  readonly packagesCount: number | null;
  readonly estimatedWeightKg: number | null;
  readonly deliveryNotesText: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly htmlUrl: string | null;
  readonly sentAt: Date | null;
  readonly cancelledAt: Date | null;
  readonly cancelReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: DeliveryNoteProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.partnerId = props.partnerId;
    this.orderId = props.orderId;
    this.number = props.number;
    this.year = props.year;
    this.ddtDate = props.ddtDate;
    this.status = props.status;
    this.causale = props.causale;
    this.carrier = props.carrier;
    this.packagesCount = props.packagesCount;
    this.estimatedWeightKg = props.estimatedWeightKg;
    this.deliveryNotesText = props.deliveryNotesText;
    this.customerSnapshot = props.customerSnapshot;
    this.htmlUrl = props.htmlUrl;
    this.sentAt = props.sentAt;
    this.cancelledAt = props.cancelledAt;
    this.cancelReason = props.cancelReason;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static fromPrisma(row: PrismaDeliveryNote): DeliveryNote {
    return new DeliveryNote({
      ...row,
      customerSnapshot: row.customerSnapshot as unknown as CustomerSnapshot,
    });
  }

  /** Human-readable progressive label, e.g. "12/2026". */
  get label(): string {
    return `${this.number}/${this.year}`;
  }
}
