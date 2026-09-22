import { randomUUID } from 'node:crypto';
import { Company as PrismaCompany, CompanyKind } from '@prisma/client';

export class Company {
  public readonly id: string;
  public readonly name: string;
  public readonly vatNumber: string;
  public readonly cuaa: string | null;
  public readonly ownerId: string | null;
  public readonly fiscalCode: string;
  public readonly nation: string | null;
  public readonly city: string | null;
  public readonly address: string | null;
  public readonly cap: string | null;
  public readonly email: string | null;
  public readonly phoneNumber: string | null;
  public readonly website: string | null;
  public readonly logoUrl: string | null;
  public readonly kind: CompanyKind;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;

  /**
   * Overload without ownerId (legacy/tests):
   */
  constructor(
    id: string,
    name: string,
    vatNumber: string,
    cuaa: string | null,
    fiscalCode: string,
    nation: string | null,
    city: string | null,
    address: string | null,
    cap: string | null,
    email: string | null,
    phoneNumber: string | null,
    website: string | null,
    logoUrl: string | null,
    createdAt: Date,
    updatedAt?: Date,
  );
  /**
   * Overload with ownerId (preferred in application layer):
   */
  constructor(
    id: string,
    name: string,
    vatNumber: string,
    cuaa: string | null,
    ownerId: string | null,
    fiscalCode: string,
    nation: string | null,
    city: string | null,
    address: string | null,
    cap: string | null,
    email: string | null,
    phoneNumber: string | null,
    website: string | null,
    logoUrl: string | null,
    createdAt: Date,
    updatedAt?: Date,
  );
  /**
   * Overload with ownerId and kind (preferred in application layer):
   */
  constructor(
    id: string,
    name: string,
    vatNumber: string,
    cuaa: string | null,
    ownerId: string | null,
    fiscalCode: string,
    nation: string | null,
    city: string | null,
    address: string | null,
    cap: string | null,
    email: string | null,
    phoneNumber: string | null,
    website: string | null,
    logoUrl: string | null,
    kind: CompanyKind,
    createdAt: Date,
    updatedAt?: Date,
  );
  constructor(...args: unknown[]) {
    if (args.length === 15) {
      const [
        id,
        name,
        vatNumber,
        cuaa,
        fiscalCode,
        nation,
        city,
        address,
        cap,
        email,
        phoneNumber,
        website,
        logoUrl,
        createdAt,
        updatedAt,
      ] = args as [
        string,
        string,
        string,
        string | null,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        Date,
        Date?,
      ];
      this.id = id;
      this.name = name;
      this.vatNumber = vatNumber;
      this.cuaa = cuaa;
      this.ownerId = null;
      this.fiscalCode = fiscalCode;
      this.nation = nation;
      this.city = city;
      this.address = address;
      this.cap = cap;
      this.email = email;
      this.phoneNumber = phoneNumber;
      this.website = website;
      this.logoUrl = logoUrl;
      this.kind = CompanyKind.AGRICULTURAL;
      this.createdAt = createdAt;
      this.updatedAt = updatedAt ?? createdAt;
      return;
    }
    if (args.length === 16) {
      const [
        id,
        name,
        vatNumber,
        cuaa,
        ownerId,
        fiscalCode,
        nation,
        city,
        address,
        cap,
        email,
        phoneNumber,
        website,
        logoUrl,
        createdAt,
        updatedAt,
      ] = args as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        Date,
        Date?,
      ];
      this.id = id;
      this.name = name;
      this.vatNumber = vatNumber;
      this.cuaa = cuaa;
      this.ownerId = ownerId;
      this.fiscalCode = fiscalCode;
      this.nation = nation;
      this.city = city;
      this.address = address;
      this.cap = cap;
      this.email = email;
      this.phoneNumber = phoneNumber;
      this.website = website;
      this.logoUrl = logoUrl;
      this.kind = CompanyKind.AGRICULTURAL;
      this.createdAt = createdAt;
      this.updatedAt = updatedAt ?? createdAt;
      return;
    }
    if (args.length === 17) {
      const [
        id,
        name,
        vatNumber,
        cuaa,
        ownerId,
        fiscalCode,
        nation,
        city,
        address,
        cap,
        email,
        phoneNumber,
        website,
        logoUrl,
        kind,
        createdAt,
        updatedAt,
      ] = args as [
        string,
        string,
        string,
        string | null,
        string | null,
        string,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        string | null,
        CompanyKind,
        Date,
        Date?,
      ];
      this.id = id;
      this.name = name;
      this.vatNumber = vatNumber;
      this.cuaa = cuaa;
      this.ownerId = ownerId;
      this.fiscalCode = fiscalCode;
      this.nation = nation;
      this.city = city;
      this.address = address;
      this.cap = cap;
      this.email = email;
      this.phoneNumber = phoneNumber;
      this.website = website;
      this.logoUrl = logoUrl;
      this.kind = kind;
      this.createdAt = createdAt;
      this.updatedAt = updatedAt ?? createdAt;
      return;
    }
    throw new Error('Invalid Company constructor arguments');
  }

  static create(
    props: Omit<PrismaCompany, 'id' | 'createdAt' | 'updatedAt' | 'courierEmail'>,
  ): Company {
    return new Company(
      randomUUID(),
      props.name,
      props.vatNumber,
      props.cuaa ?? null,
      props.ownerId ?? null,
      props.fiscalCode,
      props.nation,
      props.city,
      props.address,
      props.cap,
      props.email,
      props.phoneNumber,
      props.website,
      props.logoUrl,
      props.kind ?? CompanyKind.AGRICULTURAL,
      new Date(),
      new Date(),
    );
  }

  static fromPrisma(prismaCompany: PrismaCompany): Company {
    return new Company(
      prismaCompany.id,
      prismaCompany.name,
      prismaCompany.vatNumber,
      prismaCompany.cuaa,
      prismaCompany.ownerId,
      prismaCompany.fiscalCode,
      prismaCompany.nation,
      prismaCompany.city,
      prismaCompany.address,
      prismaCompany.cap,
      prismaCompany.email,
      prismaCompany.phoneNumber,
      prismaCompany.website,
      prismaCompany.logoUrl,
      prismaCompany.kind,
      prismaCompany.createdAt,
      prismaCompany.updatedAt,
    );
  }

  isValidVatNumber(): boolean {
    return /^[0-9]{11}$/.test(this.vatNumber);
  }

  isValidFiscalCode(): boolean {
    return /^[A-Z0-9]{11,16}$/.test(this.fiscalCode);
  }
}
