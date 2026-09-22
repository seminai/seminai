import { PartnerType } from '@prisma/client';
import { BusinessPartner } from '../../../domain/entities/BusinessPartner';
import { IBusinessPartnerRepository } from '../../../domain/repositories/IBusinessPartnerRepository';
import { AppError } from '../../../domain/errors/AppError';
import { normalizeVat } from '../../../domain/utils/vat';

/** Customer fields extracted from an order (email/template/chat). */
export interface PartnerFromExtractionInput {
  readonly companyId: string;
  readonly name: string;
  readonly vatNumber?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly city?: string | null;
  readonly address?: string | null;
  readonly cap?: string | null;
}

export interface PartnerUpsertResult {
  readonly partner: BusinessPartner;
  readonly reused: boolean;
}

/**
 * Matches a CUSTOMER by normalized VAT / email / name (dedup). On match, enriches
 * only the missing fields; otherwise creates a new partner. Conservative: never
 * overwrites data the user already entered.
 */
export class CreateOrUpdatePartnerFromExtractionUseCase {
  constructor(private readonly partnerRepository: IBusinessPartnerRepository) {}

  async execute(input: PartnerFromExtractionInput): Promise<PartnerUpsertResult> {
    if (!input.companyId) throw AppError.badRequest('companyId is required', 'MISSING_COMPANY');
    if (!input.name || input.name.trim().length === 0) {
      throw AppError.badRequest('name is required', 'MISSING_NAME');
    }
    const vatNumber = normalizeVat(input.vatNumber);
    const existing = await this.partnerRepository.findDuplicate({
      companyId: input.companyId,
      type: PartnerType.CUSTOMER,
      vatNumber,
      email: input.email ?? null,
      name: input.name,
    });
    if (existing) {
      const patch = buildEnrichPatch(existing, { ...input, vatNumber });
      const partner =
        Object.keys(patch).length > 0
          ? await this.partnerRepository.update(existing.id, patch as Partial<BusinessPartner>)
          : existing;
      return { partner, reused: true };
    }
    const created = await this.partnerRepository.create(
      BusinessPartner.create({
        companyId: input.companyId,
        type: PartnerType.CUSTOMER,
        name: input.name,
        vatNumber,
        email: input.email ?? null,
        phone: input.phone ?? null,
        city: input.city ?? null,
        address: input.address ?? null,
        cap: input.cap ?? null,
      }),
    );
    return { partner: created, reused: false };
  }
}

/** Builds an update patch with only the fields the existing partner is missing. */
function buildEnrichPatch(
  existing: BusinessPartner,
  input: PartnerFromExtractionInput & { vatNumber: string | null },
): Record<string, string> {
  const patch: Record<string, string> = {};
  if (input.vatNumber && !existing.vatNumber) patch.vatNumber = input.vatNumber;
  if (input.email && !existing.email) patch.email = input.email;
  if (input.phone && !existing.phone) patch.phone = input.phone;
  if (input.city && !existing.city) patch.city = input.city;
  if (input.address && !existing.address) patch.address = input.address;
  if (input.cap && !existing.cap) patch.cap = input.cap;
  return patch;
}
