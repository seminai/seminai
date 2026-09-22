import { PartnerType } from '@prisma/client';

/**
 * Request payload to create or update a BusinessPartner (cliente/fornitore).
 * `companyId` and `type` identify the owning company (seller) and the partner role.
 */
export interface UpsertBusinessPartnerDTO {
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
  readonly nation?: string | null;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly cap?: string | null;
  readonly deliveryAddress?: string | null;
  readonly deliveryCity?: string | null;
  readonly deliveryCap?: string | null;
  readonly deliveryNation?: string | null;
  readonly deliveryNotesText?: string | null;
  readonly deliveryHours?: string | null;
  readonly isActive?: boolean;
}

/** Criteria used to detect duplicate partners (P.IVA / email / ragione sociale). */
export interface PartnerDuplicateQuery {
  readonly companyId: string;
  readonly type: PartnerType;
  readonly vatNumber?: string | null;
  readonly email?: string | null;
  readonly name?: string | null;
}
