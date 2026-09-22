import { Field } from '../../../domain/entities/Field';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { AppError } from '../../../domain/errors/AppError';
import type { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import type { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import type { FieldPreview, ProductionUnitPreview } from './ExtractFromFileUseCase';

export interface BulkCreateOnboardingDataInput {
  readonly companyId: string;
  readonly fields: FieldPreview[];
  readonly productionUnits: ProductionUnitPreview[];
}

export class BulkCreateOnboardingDataUseCase {
  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  async execute(input: BulkCreateOnboardingDataInput) {
    this.validate(input);
    const fieldEntities = (input.fields ?? []).map((field, index) =>
      this.toField(input.companyId, field, index),
    );
    const fields = await this.fieldRepository.upsertMany(fieldEntities);
    const fieldIndex = this.buildFieldIndex(fields);
    const productionUnits = await this.productionUnitRepository.createBulk(
      (input.productionUnits ?? []).map((unit) => this.toProductionUnit(unit, fieldIndex)),
    );
    return { fields, productionUnits };
  }

  private validate(input: BulkCreateOnboardingDataInput): void {
    if (!input.companyId) throw AppError.badRequest('Missing companyId', 'MISSING_COMPANY_ID');
    if (!Array.isArray(input.fields) && !Array.isArray(input.productionUnits)) {
      throw AppError.badRequest(
        'Either fields or productionUnits must be provided',
        'MISSING_DATA',
      );
    }
    (input.fields ?? []).forEach((field, index) => {
      if (!field.name && !field.foglio && !field.particella) {
        throw AppError.badRequest(
          `Field at index ${index} is missing both name and cadastral references`,
          'INVALID_FIELD_DATA',
        );
      }
    });
  }

  private toField(companyId: string, field: FieldPreview, index: number): Field {
    const hasCadastral = field.foglio && field.particella;
    const name =
      field.name || (hasCadastral ? `F${field.foglio} P${field.particella}` : `Campo ${index + 1}`);
    return Field.create({
      companyId,
      sourceFileId: field.sourceFileId ?? null,
      name,
      coordinates: field.coordinates ?? [],
      coordinatesGaussBoaga: field.coordinatesGaussBoaga ?? [],
      latitude: field.latitude ?? null,
      longitude: field.longitude ?? null,
      polygon: field.polygon ?? null,
      polygonGaussBoaga: field.polygonGaussBoaga ?? null,
      gisHa: field.gisHa ?? null,
      sauHa: field.sauHa ?? null,
      ph: field.ph ?? null,
      nitrogen: field.nitrogen ?? null,
      phosphorus: field.phosphorus ?? null,
      potassium: field.potassium ?? null,
      calcium: field.calcium ?? null,
      magnesium: field.magnesium ?? null,
      soilType: field.soilType ?? null,
      uso: field.uso ?? null,
      qualita: field.qualita ?? null,
      superficieCatastaleMq: field.superficieCatastaleMq ?? null,
      sezione: field.sezione ?? null,
      foglio: field.foglio ?? null,
      particella: field.particella ?? null,
      subalterno: field.subalterno ?? null,
      nation: field.nation ?? 'IT',
      region: field.region ?? null,
      city: field.city ?? null,
      address: field.address ?? field.city ?? null,
      cap: field.cap ?? null,
      variazioneMq: field.variazioneMq ?? null,
      inizioConduzione: field.inizioConduzione ? new Date(field.inizioConduzione) : null,
      fineConduzione: field.fineConduzione ? new Date(field.fineConduzione) : null,
      bufferZoneNotes: null,
    });
  }

  private buildFieldIndex(fields: readonly Field[]) {
    const index = new Map<string, { id: string; name: string }>();
    for (const field of fields) {
      const keys = [field.name];
      if (field.foglio && field.particella) {
        keys.push(
          `${field.foglio}_${field.particella}`,
          `${field.sezione || ''}_${field.foglio}_${field.particella}`,
          `${field.sezione || ''}_${field.foglio}_${field.particella}_${field.subalterno || ''}`,
        );
      }
      keys.forEach((key) => index.set(key.toLowerCase(), { id: field.id, name: field.name }));
    }
    return index;
  }

  private toProductionUnit(
    unit: ProductionUnitPreview,
    fieldIndex: ReadonlyMap<string, { id: string; name: string }>,
  ) {
    const primaryCycle = unit.cycles?.[0];
    const areaHa =
      unit.areaHa ??
      unit.fieldAllocations?.reduce((sum, allocation) => sum + (allocation.areaHa ?? 0), 0) ??
      0;
    const productionUnit = ProductionUnit.create({
      name: unit.name || 'Unità produttiva',
      cropName: unit.cropName || primaryCycle?.cropName || '',
      cropType: unit.cropType || primaryCycle?.cropType || '',
      variety: unit.variety || primaryCycle?.variety || '',
      protocoll: unit.protocoll || '',
      areaHa,
      protectionStructure: unit.protectionStructure || primaryCycle?.protectionStructure || '',
      startDate: unit.startDate ? new Date(unit.startDate) : null,
      floweringDate: unit.floweringDate ? new Date(unit.floweringDate) : null,
      harvestingDate: unit.harvestingDate ? new Date(unit.harvestingDate) : null,
      endDate: unit.endDate ? new Date(unit.endDate) : null,
      occupazione: unit.occupazione ?? null,
      destinazioneDiUso: unit.destinazioneDiUso ?? null,
      acquaTotalePeridoL: 0,
    });
    const allocations = (unit.fieldAllocations ?? []).flatMap((allocation) => {
      const field = this.resolveField(allocation, fieldIndex);
      return field ? [{ fieldId: field.id, areaHaOnField: allocation.areaHa }] : [];
    });
    return { productionUnit, allocations };
  }

  private resolveField(
    allocation: NonNullable<ProductionUnitPreview['fieldAllocations']>[number],
    fieldIndex: ReadonlyMap<string, { id: string; name: string }>,
  ) {
    if (!allocation.foglio || !allocation.particella) return null;
    const keys = [
      `${allocation.sezione || ''}_${allocation.foglio}_${allocation.particella}_${allocation.subalterno || ''}`,
      `${allocation.sezione || ''}_${allocation.foglio}_${allocation.particella}`,
      `${allocation.foglio}_${allocation.particella}`,
      allocation.fieldName,
    ];
    for (const key of keys) {
      const field = fieldIndex.get(key.toLowerCase());
      if (field) return field;
    }
    return null;
  }
}
