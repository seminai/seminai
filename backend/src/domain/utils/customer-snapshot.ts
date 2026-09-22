import { BusinessPartner } from '../entities/BusinessPartner';
import { CustomerSnapshot } from '../dtos/delivery-note.dto';

/**
 * Builds the frozen historical copy of a customer's data for a DDT.
 * Delivery address falls back to the legal address when not provided.
 */
export function buildCustomerSnapshot(partner: BusinessPartner): CustomerSnapshot {
  return {
    partnerId: partner.id,
    name: partner.name,
    vatNumber: partner.vatNumber,
    fiscalCode: partner.fiscalCode,
    sdiCode: partner.sdiCode,
    pec: partner.pec,
    email: partner.email,
    phone: partner.phone,
    referent: partner.referent,
    legalAddress: {
      address: partner.address,
      city: partner.city,
      cap: partner.cap,
      nation: partner.nation,
    },
    deliveryAddress: {
      address: partner.deliveryAddress ?? partner.address,
      city: partner.deliveryCity ?? partner.city,
      cap: partner.deliveryCap ?? partner.cap,
      nation: partner.deliveryNation ?? partner.nation,
    },
    deliveryNotesText: partner.deliveryNotesText,
    deliveryHours: partner.deliveryHours,
  };
}
