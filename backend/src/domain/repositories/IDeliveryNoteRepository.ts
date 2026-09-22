import { DeliveryNoteStatus } from '@prisma/client';
import { DeliveryNote } from '../entities/DeliveryNote';
import { DeliveryNoteItem } from '../entities/DeliveryNoteItem';
import { CustomerSnapshot } from '../dtos/delivery-note.dto';

/** A DDT header together with its lines. */
export interface DeliveryNoteWithItems {
  readonly deliveryNote: DeliveryNote;
  readonly items: readonly DeliveryNoteItem[];
}

/** One line to be written to a DDT, with its frozen product snapshot. */
export interface DeliveryNoteLineInput {
  readonly productId: string;
  readonly productName: string;
  readonly sku: string | null;
  readonly vintage: number | null;
  readonly unitOfMeasure: string | null;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly discount: number;
  readonly vatRate: number;
}

/** Everything needed to generate a DDT atomically (numbering + scarico included). */
export interface GenerateDeliveryNoteRepoInput {
  readonly companyId: string;
  readonly partnerId: string;
  readonly orderId: string;
  readonly year: number;
  readonly ddtDate: Date;
  readonly causale: string | null;
  readonly carrier: string | null;
  readonly packagesCount: number | null;
  readonly estimatedWeightKg: number | null;
  readonly deliveryNotesText: string | null;
  readonly customerSnapshot: CustomerSnapshot;
  readonly lines: readonly DeliveryNoteLineInput[];
}

/** Persistence contract for DDTs and their atomic warehouse effects. */
export interface IDeliveryNoteRepository {
  /**
   * Atomically: assign the next progressive number, create the DDT + lines,
   * write the Stock OUT movements (scarico) and mark the order FULFILLED.
   * Throws when the available balance is insufficient (no mutation persists).
   */
  generate(input: GenerateDeliveryNoteRepoInput): Promise<DeliveryNoteWithItems>;
  /**
   * Atomically reverse a DDT: write compensating Stock IN movements (storno/rientro),
   * set the DDT to CANCELLED and restore the order to CONFIRMED.
   */
  cancel(input: { deliveryNoteId: string; reason: string | null }): Promise<DeliveryNoteWithItems>;
  /** Marks a GENERATED DDT as SENT (handed to the courier). Idempotency: throws if already SENT. */
  markSent(deliveryNoteId: string): Promise<DeliveryNoteWithItems>;
  findById(id: string): Promise<DeliveryNoteWithItems | null>;
  findManyByCompany(
    companyId: string,
    options?: { status?: DeliveryNoteStatus },
  ): Promise<DeliveryNoteWithItems[]>;
  setHtmlUrl(id: string, htmlUrl: string): Promise<void>;
}
