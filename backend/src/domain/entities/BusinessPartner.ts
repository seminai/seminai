import { randomUUID } from 'node:crypto';
import { BusinessPartner as PrismaBusinessPartner, PartnerType } from '@prisma/client';
import { UpsertBusinessPartnerDTO } from '../dtos/business-partner.dto';

/** Full immutable shape of a BusinessPartner. */
export interface BusinessPartnerProps {
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
  readonly nation: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly cap: string | null;
  readonly deliveryAddress: string | null;
  readonly deliveryCity: string | null;
  readonly deliveryCap: string | null;
  readonly deliveryNation: string | null;
  readonly deliveryNotesText: string | null;
  readonly deliveryHours: string | null;
  readonly followUpEnabled: boolean;
  readonly followUpLastSentAt: Date | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/**
 * Unified customer/supplier entity (anagrafica), scoped to a selling Company.
 */
export class BusinessPartner implements BusinessPartnerProps {
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
  readonly nation: string | null;
  readonly city: string | null;
  readonly address: string | null;
  readonly cap: string | null;
  readonly deliveryAddress: string | null;
  readonly deliveryCity: string | null;
  readonly deliveryCap: string | null;
  readonly deliveryNation: string | null;
  readonly deliveryNotesText: string | null;
  readonly deliveryHours: string | null;
  readonly followUpEnabled: boolean;
  readonly followUpLastSentAt: Date | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;

  constructor(props: BusinessPartnerProps) {
    this.id = props.id;
    this.companyId = props.companyId;
    this.type = props.type;
    this.name = props.name;
    this.vatNumber = props.vatNumber;
    this.fiscalCode = props.fiscalCode;
    this.sdiCode = props.sdiCode;
    this.pec = props.pec;
    this.email = props.email;
    this.phone = props.phone;
    this.referent = props.referent;
    this.nation = props.nation;
    this.city = props.city;
    this.address = props.address;
    this.cap = props.cap;
    this.deliveryAddress = props.deliveryAddress;
    this.deliveryCity = props.deliveryCity;
    this.deliveryCap = props.deliveryCap;
    this.deliveryNation = props.deliveryNation;
    this.deliveryNotesText = props.deliveryNotesText;
    this.deliveryHours = props.deliveryHours;
    this.followUpEnabled = props.followUpEnabled;
    this.followUpLastSentAt = props.followUpLastSentAt;
    this.isActive = props.isActive;
    this.createdAt = props.createdAt;
    this.updatedAt = props.updatedAt;
  }

  static create(data: UpsertBusinessPartnerDTO): BusinessPartner {
    const now = new Date();
    return new BusinessPartner({
      id: randomUUID(),
      companyId: data.companyId,
      type: data.type,
      name: data.name.trim(),
      vatNumber: data.vatNumber ?? null,
      fiscalCode: data.fiscalCode ?? null,
      sdiCode: data.sdiCode ?? null,
      pec: data.pec ?? null,
      email: data.email ?? null,
      phone: data.phone ?? null,
      referent: data.referent ?? null,
      nation: data.nation ?? null,
      city: data.city ?? null,
      address: data.address ?? null,
      cap: data.cap ?? null,
      deliveryAddress: data.deliveryAddress ?? null,
      deliveryCity: data.deliveryCity ?? null,
      deliveryCap: data.deliveryCap ?? null,
      deliveryNation: data.deliveryNation ?? null,
      deliveryNotesText: data.deliveryNotesText ?? null,
      deliveryHours: data.deliveryHours ?? null,
      followUpEnabled: false,
      followUpLastSentAt: null,
      isActive: data.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    });
  }

  static fromPrisma(row: PrismaBusinessPartner): BusinessPartner {
    return new BusinessPartner(row);
  }
}
