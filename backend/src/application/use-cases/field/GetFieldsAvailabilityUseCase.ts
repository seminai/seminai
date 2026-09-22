import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import { resolveFieldConductionDates } from '../../../infrastructure/utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../../infrastructure/utils/resolve-field-sau-ha';

export interface FieldAvailability {
  id: string;
  name: string;
  sauHa: number;
  areaOccupied: number;
  areaAvailable: number;
  coordinates: number[];
  latitude: number | null;
  longitude: number | null;
  polygon: unknown | null;
  gisHa: number | null;
  ph: number | null;
  nitrogen: number | null;
  phosphorus: number | null;
  potassium: number | null;
  calcium: number | null;
  magnesium: number | null;
  soilType: string | null;
  uso: string | null;
  qualita: string | null;
  superficieCatastaleMq: number | null;
  sezione: string | null;
  foglio: string | null;
  particella: string | null;
  subalterno: string | null;
  nation: string | null;
  region: string | null;
  city: string | null;
  address: string | null;
  cap: string | null;
  variazioneMq: string | null;
  inizioConduzione: Date | null;
  fineConduzione: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CompanyFieldsAvailability {
  companyId: string;
  companyName: string;
  fields: FieldAvailability[];
}

export interface GetFieldsAvailabilityInput {
  userId: string;
  startAt?: Date;
  endAt?: Date;
}

export class GetFieldsAvailabilityUseCase {
  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  async execute(input: GetFieldsAvailabilityInput): Promise<CompanyFieldsAvailability[]> {
    const now = new Date();
    const oneYearFromNow = new Date(now);
    oneYearFromNow.setFullYear(now.getFullYear() + 1);
    const startDate = input.startAt ?? now;
    const endDate = input.endAt ?? oneYearFromNow;
    const allFields = await this.fieldRepository.findManyByUserId(input.userId);
    const fieldsWithAvailability: Array<
      FieldAvailability & { companyId: string | null; companyName: string | undefined }
    > = [];
    for (const field of allFields) {
      const sauHa = resolveFieldSauHa(field.sauHa, field.gisHa, field.superficieCatastaleMq);
      if (sauHa === null) {
        continue;
      }
      const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
        field.inizioConduzione,
        field.fineConduzione,
      );
      const isWithinConductionPeriod = inizioConduzione <= endDate && fineConduzione >= startDate;
      if (!isWithinConductionPeriod) {
        continue;
      }
      const areaOccupied = await this.productionUnitRepository.sumAreaByFieldAndOverlappingRange(
        field.id,
        { startDate, endDate },
      );
      const areaAvailable = sauHa - areaOccupied;
      if (areaAvailable <= 0) {
        continue;
      }
      fieldsWithAvailability.push({
        id: field.id,
        name: field.name,
        sauHa,
        areaOccupied,
        areaAvailable,
        coordinates: field.coordinates,
        latitude: field.latitude,
        longitude: field.longitude,
        polygon: field.polygon,
        gisHa: field.gisHa,
        ph: field.ph,
        nitrogen: field.nitrogen,
        phosphorus: field.phosphorus,
        potassium: field.potassium,
        calcium: field.calcium,
        magnesium: field.magnesium,
        soilType: field.soilType,
        uso: field.uso,
        qualita: field.qualita,
        superficieCatastaleMq: field.superficieCatastaleMq,
        sezione: field.sezione,
        foglio: field.foglio,
        particella: field.particella,
        subalterno: field.subalterno,
        nation: field.nation,
        region: field.region,
        city: field.city,
        address: field.address,
        cap: field.cap,
        variazioneMq: field.variazioneMq,
        inizioConduzione: field.inizioConduzione,
        fineConduzione: field.fineConduzione,
        createdAt: field.createdAt,
        updatedAt: field.updatedAt,
        companyId: field.companyId,
        companyName: field.companyName,
      });
    }
    const companyMap = new Map<string, CompanyFieldsAvailability>();
    for (const field of fieldsWithAvailability) {
      if (!field.companyId) {
        continue;
      }
      if (!companyMap.has(field.companyId)) {
        companyMap.set(field.companyId, {
          companyId: field.companyId,
          companyName: field.companyName || 'Unknown Company',
          fields: [],
        });
      }
      const companyEntry = companyMap.get(field.companyId)!;
      companyEntry.fields.push(field);
    }
    return Array.from(companyMap.values());
  }
}
