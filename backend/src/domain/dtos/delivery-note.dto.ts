/** Frozen address block stored inside a DDT customer snapshot. */
export interface SnapshotAddress {
  readonly address: string | null;
  readonly city: string | null;
  readonly cap: string | null;
  readonly nation: string | null;
}

/**
 * Historical copy of the customer data at DDT generation time.
 * Later edits to the BusinessPartner must NOT alter already-generated DDTs.
 */
export interface CustomerSnapshot {
  readonly partnerId: string;
  readonly name: string;
  readonly vatNumber: string | null;
  readonly fiscalCode: string | null;
  readonly sdiCode: string | null;
  readonly pec: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly referent: string | null;
  readonly legalAddress: SnapshotAddress;
  readonly deliveryAddress: SnapshotAddress;
  readonly deliveryNotesText: string | null;
  readonly deliveryHours: string | null;
}

/** Request payload to generate a DDT from a confirmed order. */
export interface GenerateDeliveryNoteDTO {
  readonly orderId: string;
  readonly causale?: string | null;
  readonly carrier?: string | null;
  readonly packagesCount?: number | null;
  readonly estimatedWeightKg?: number | null;
  readonly deliveryNotesText?: string | null;
  readonly ddtDate?: Date | null;
}

/** Request payload to cancel a DDT (storno/rientro magazzino). */
export interface CancelDeliveryNoteDTO {
  readonly deliveryNoteId: string;
  readonly reason?: string | null;
}
