import { Prisma } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { NormalizedUnit, PROVINCE_TO_REGION, RegionLookupInput, RegionLookupResult, RegionResolution, RegionSource, extractProvinceCode, normalizeProvinceCode, normalizeRegionName, normalizeString, unitRegionCache } from './flowMatchDosageDisciplinari.part-01-usage-logger';
import { buildAddressString, extractFromSnapshot, extractProvinceFromSnapshot, geocodeRegion } from './flowMatchDosageDisciplinari.part-03-select-dose-limit';

export class RegionLookupService {
  public async findRegion(input: RegionLookupInput): Promise<RegionLookupResult | undefined> {
    const provinceRegion =
      this.mapProvinceToRegion(input.province) ||
      this.mapProvinceToRegion(extractProvinceCode(input.city));
    if (provinceRegion) {
      return {
        regionLabel: provinceRegion,
        normalizedRegion: normalizeRegionName(provinceRegion),
        source: RegionSource.PROVINCE_LOOKUP,
      };
    }
    const address = buildAddressString([
      normalizeString(input.address),
      normalizeString(input.city),
      normalizeProvinceCode(input.province) ?? extractProvinceCode(input.city),
      normalizeString(input.cap),
      normalizeString(input.nation) ?? 'Italia',
    ]);
    if (address) {
      const region = await geocodeRegion(address);
      if (region) {
        return {
          regionLabel: region,
          normalizedRegion: normalizeRegionName(region),
          source: RegionSource.FIELD_GEOCODED,
          addressUsed: address,
        };
      }
    }
    const cityQuery = buildAddressString([
      normalizeString(input.city),
      normalizeProvinceCode(input.province) ?? extractProvinceCode(input.city),
      normalizeString(input.nation) ?? 'Italia',
    ]);
    if (cityQuery) {
      const cityRegion = await geocodeRegion(cityQuery);
      if (cityRegion) {
        return {
          regionLabel: cityRegion,
          normalizedRegion: normalizeRegionName(cityRegion),
          source: RegionSource.CITY_GEOCODED,
          addressUsed: cityQuery,
        };
      }
    }
    return undefined;
  }

  private mapProvinceToRegion(province?: string | null): string | undefined {
    const code = normalizeProvinceCode(province);
    if (!code) return undefined;
    return PROVINCE_TO_REGION[code];
  }
}

export const regionLookupService = new RegionLookupService();

export type ProductionUnitWithFields = Prisma.ProductionUnitGetPayload<{
  include: {
    productionUnitsOnFields: {
      include: {
        field: {
          select: {
            region: true;
            city: true;
            address: true;
            cap: true;
            nation: true;
            company: {
              select: {
                name: true;
                city: true;
                address: true;
                cap: true;
                nation: true;
              };
            };
          };
        };
      };
    };
  };
}>;

export async function fetchUnitRegionFromDatabase(unitProductionId: string): Promise<RegionResolution> {
  const unitRecord: ProductionUnitWithFields | null = await prisma.productionUnit.findUnique({
    where: { id: unitProductionId },
    include: {
      productionUnitsOnFields: {
        include: {
          field: {
            select: {
              region: true,
              city: true,
              address: true,
              cap: true,
              nation: true,
              company: {
                select: {
                  name: true,
                  city: true,
                  address: true,
                  cap: true,
                  nation: true,
                },
              },
            },
          },
        },
      },
    },
  });
  const relation = unitRecord?.productionUnitsOnFields?.[0];
  const field = relation?.field;
  const company = field?.company;

  if (field?.region) {
    const normalized = normalizeRegionName(field.region);
    return {
      regionLabel: field.region,
      normalizedRegion: normalized,
      source: RegionSource.FIELD,
      companyName: company?.name ?? undefined,
    };
  }
  const fieldResolution = await regionLookupService.findRegion({
    address: normalizeString(field?.address),
    city: normalizeString(field?.city),
    cap: normalizeString(field?.cap),
    province: extractProvinceCode(field?.city),
    nation: normalizeString(field?.nation) ?? 'Italia',
  });
  if (fieldResolution) {
    return {
      ...fieldResolution,
      companyName: company?.name ?? undefined,
    };
  }
  const companyResolution = await regionLookupService.findRegion({
    address: normalizeString(company?.address),
    city: normalizeString(company?.city),
    cap: normalizeString(company?.cap),
    province: extractProvinceCode(company?.city),
    nation: normalizeString(company?.nation) ?? 'Italia',
  });
  if (companyResolution) {
    const adjustedSource =
      companyResolution.source === RegionSource.PROVINCE_LOOKUP
        ? RegionSource.PROVINCE_LOOKUP
        : RegionSource.COMPANY_GEOCODED;
    return {
      ...companyResolution,
      source: adjustedSource,
      companyName: company?.name ?? undefined,
    };
  }
  return {
    source: RegionSource.UNKNOWN,
  };
}

export async function resolveUnitRegion(
  unitProductionId: string,
  normalizedUnit: NormalizedUnit | undefined,
): Promise<RegionResolution & { address?: string }> {
  if (unitRegionCache.has(unitProductionId)) {
    const cached = unitRegionCache.get(unitProductionId)!;
    return { ...cached, address: undefined };
  }
  const snapshotRegion =
    extractFromSnapshot(normalizedUnit, 'region') || extractFromSnapshot(normalizedUnit, 'regione');
  if (snapshotRegion) {
    const resolution: RegionResolution = {
      regionLabel: snapshotRegion,
      normalizedRegion: normalizeRegionName(snapshotRegion),
      source: RegionSource.FIELD,
    };
    unitRegionCache.set(unitProductionId, resolution);
    const address = buildAddressString([
      extractFromSnapshot(normalizedUnit, 'address'),
      extractFromSnapshot(normalizedUnit, 'city'),
      extractProvinceFromSnapshot(normalizedUnit),
      extractFromSnapshot(normalizedUnit, 'cap'),
      extractFromSnapshot(normalizedUnit, 'nation') ?? 'Italia',
    ]);
    return { ...resolution, address: address };
  }
  const lookupInput: RegionLookupInput = {
    address: extractFromSnapshot(normalizedUnit, 'address'),
    city: extractFromSnapshot(normalizedUnit, 'city'),
    cap: extractFromSnapshot(normalizedUnit, 'cap'),
    province: extractProvinceFromSnapshot(normalizedUnit),
    nation: extractFromSnapshot(normalizedUnit, 'nation') ?? 'Italia',
  };
  const snapshotLookup = await regionLookupService.findRegion(lookupInput);
  if (snapshotLookup) {
    const { addressUsed, ...resolution } = snapshotLookup;
    unitRegionCache.set(unitProductionId, resolution);
    return { ...resolution, address: addressUsed };
  }
  const dbResolution = await fetchUnitRegionFromDatabase(unitProductionId);
  unitRegionCache.set(unitProductionId, dbResolution);
  return { ...dbResolution, address: undefined };
}
