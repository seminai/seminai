import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import {
  IProductionUnitRepository,
  type ProductionUnitCycleCreateInput,
} from '../../../domain/repositories/IProductionUnitRepository';
import { ICompanyRepository } from '../../../domain/repositories/ICompanyRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Field } from '../../../domain/entities/Field';
import { ProductionUnit } from '../../../domain/entities/ProductionUnit';
import { BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { buildFieldAllocationLookup } from './field-allocation-lookup';
import { resolveFieldConductionDates } from '../../../infrastructure/utils/field-conduction-dates';
import { resolveFieldSauHa } from '../../../infrastructure/utils/resolve-field-sau-ha';

export class BulkImportFieldsAndProductionUnitsUseCase {
  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
    private readonly companyRepository: ICompanyRepository,
  ) {}

  async execute({
    userId,
    companyName,
    vatNumber,
    fields,
    productionUnits,
  }: BulkImportDTO): Promise<{
    fields: Field[];
    productionUnits: ProductionUnit[];
    fieldCount: number;
    productionUnitCount: number;
  }> {
    if (!userId) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    if (!Array.isArray(fields) || !Array.isArray(productionUnits)) {
      throw AppError.badRequest('Fields and productionUnits must be arrays', 'INVALID_INPUT');
    }

    // Trova la company se specificata
    let companyId: string | null = null;
    if (companyName && vatNumber) {
      const company = await this.companyRepository.findByVatNumber(vatNumber);
      if (!company) {
        throw AppError.notFound(
          `Company with VAT number ${vatNumber} not found`,
          'COMPANY_NOT_FOUND',
        );
      }
      if (company.name !== companyName) {
        throw AppError.badRequest(
          `Company name mismatch: expected ${companyName}, found ${company.name}`,
          'COMPANY_NAME_MISMATCH',
        );
      }
      companyId = company.id;
    }

    // Validazione dei campi (name e coordinates obbligatori; catastali opzionali per shapefile AGREA/Copernicus)
    if (fields.length > 0) {
      const invalidFieldIndex = fields.findIndex(
        (field) => !field.name || !Array.isArray(field.coordinates),
      );
      if (invalidFieldIndex !== -1) {
        throw AppError.badRequest(
          `Invalid field data at index ${invalidFieldIndex} (name and coordinates required)`,
          'INVALID_FIELD_DATA',
        );
      }
    }

    // Validazione delle production units
    if (productionUnits.length > 0) {
      const invalidPUIndex = productionUnits.findIndex(
        (pu) =>
          !pu.name ||
          !pu.cropName ||
          !pu.cropType ||
          !pu.variety ||
          !pu.protocoll ||
          !pu.protectionStructure ||
          !pu.startDate ||
          !pu.floweringDate ||
          !pu.harvestingDate ||
          !pu.endDate ||
          !Array.isArray(pu.fieldAllocations) ||
          pu.fieldAllocations.length === 0,
      );
      if (invalidPUIndex !== -1) {
        throw AppError.badRequest(
          `Invalid production unit data at index ${invalidPUIndex} (name, cropName, cropType, variety, protocoll, protectionStructure, dates, fieldAllocations required)`,
          'INVALID_PRODUCTION_UNIT_DATA',
        );
      }
    }

    // Step 1: Crea o aggiorna i campi (upsert)
    const fieldEntities = await Promise.all(
      fields.map(async (fieldData) => {
        // Determina il companyId per questo field
        let fieldCompanyId: string | null = companyId; // Usa quello globale se disponibile

        // Se il field specifica companyName e vatNumber, usali per trovare la company
        if (fieldData.companyName && fieldData.vatNumber) {
          const fieldCompany = await this.companyRepository.findByVatNumber(fieldData.vatNumber);
          if (!fieldCompany) {
            throw AppError.notFound(
              `Company with VAT number ${fieldData.vatNumber} not found for field ${fieldData.name}`,
              'FIELD_COMPANY_NOT_FOUND',
            );
          }
          if (fieldCompany.name !== fieldData.companyName) {
            throw AppError.badRequest(
              `Company name mismatch for field ${fieldData.name}: expected ${fieldData.companyName}, found ${fieldCompany.name}`,
              'FIELD_COMPANY_NAME_MISMATCH',
            );
          }
          fieldCompanyId = fieldCompany.id;
        }

        const { inizioConduzione, fineConduzione } = resolveFieldConductionDates(
          fieldData.inizioConduzione,
          fieldData.fineConduzione,
        );

        const field = Field.create({
          companyId: fieldCompanyId,
          name: fieldData.name,
          coordinates: fieldData.coordinates,
          latitude: fieldData.latitude ?? null,
          longitude: fieldData.longitude ?? null,
          polygon: fieldData.polygon ?? null,
          gisHa: fieldData.gisHa ?? null,
          sauHa:
            resolveFieldSauHa(
              fieldData.sauHa ?? null,
              fieldData.gisHa ?? null,
              fieldData.superficieCatastaleMq ?? null,
            ) ?? null,
          ph: fieldData.ph ?? null,
          nitrogen: fieldData.nitrogen ?? null,
          phosphorus: fieldData.phosphorus ?? null,
          potassium: fieldData.potassium ?? null,
          calcium: fieldData.calcium ?? null,
          magnesium: fieldData.magnesium ?? null,
          soilType: fieldData.soilType ?? null,
          uso: fieldData.uso ?? null,
          qualita: fieldData.qualita ?? null,
          superficieCatastaleMq: fieldData.superficieCatastaleMq ?? null,
          sezione: fieldData.sezione ?? null,
          foglio: fieldData.foglio ?? null,
          particella: fieldData.particella ?? null,
          subalterno: fieldData.subalterno ?? null,
          nation: fieldData.nation ?? null,
          region: fieldData.region ?? null,
          city: fieldData.city ?? null,
          address: fieldData.address ?? null,
          cap: fieldData.cap ?? null,
          variazioneMq: fieldData.variazioneMq ?? null,
          inizioConduzione,
          fineConduzione,
          bufferZoneNotes: null,
        });

        return field;
      }),
    );

    const upsertedFields = await this.fieldRepository.upsertMany(fieldEntities);

    const fieldLookup = buildFieldAllocationLookup(upsertedFields, companyId);

    // Step 2: Crea le production units con le associazioni ai campi
    const productionUnitEntities = productionUnits.map((puData) => {
      // Calcola l'area totale dalla somma delle allocazioni
      const totalAreaHa = puData.fieldAllocations.reduce((sum, alloc) => sum + alloc.areaHa, 0);
      const cycles = normalizeImportCycles(puData);
      const primaryCycle = cycles[0];

      const productionUnit = ProductionUnit.create({
        name: puData.name,
        cropName: primaryCycle.cropName,
        cropType: primaryCycle.cropType,
        variety: primaryCycle.variety,
        protocoll: primaryCycle.protocoll,
        areaHa: totalAreaHa,
        protectionStructure: primaryCycle.protectionStructure,
        startDate: new Date(puData.startDate),
        floweringDate: primaryCycle.floweringDate,
        harvestingDate: primaryCycle.harvestingDate,
        endDate: new Date(puData.endDate),
        occupazione: primaryCycle.occupazione,
        destinazioneDiUso: primaryCycle.destinazioneDiUso,
        acquaTotalePeridoL: primaryCycle.acquaTotalePeridoL,
        seasonYear: primaryCycle.seasonYear,
        cycleIndex: primaryCycle.cycleIndex,
      });

      // Converte le allocazioni usando gli ID dei campi trovati tramite riferimenti catastali
      const allocations = puData.fieldAllocations.map((alloc) => {
        const resolution = fieldLookup.resolve(alloc);
        if (resolution.status === 'ambiguous') {
          throw AppError.badRequest(
            `Ambiguous field allocation ${alloc.fieldName} (${alloc.foglio}-${alloc.particella}) for production unit ${puData.name}`,
            'FIELD_ALLOCATION_AMBIGUOUS',
          );
        }
        if (resolution.status === 'missing') {
          const ref =
            alloc.foglio && alloc.particella
              ? `(${alloc.sezione ?? ''}-${alloc.foglio}-${alloc.particella}${alloc.subalterno ? '-' + alloc.subalterno : ''})`
              : '';
          throw AppError.badRequest(
            `Field ${alloc.fieldName} ${ref} not found for production unit ${puData.name}`,
            'FIELD_NOT_FOUND',
          );
        }

        return {
          fieldId: resolution.fieldId,
          areaHaOnField: alloc.areaHa,
        };
      });

      return {
        productionUnit,
        allocations,
        additionalCycles: cycles,
      };
    });

    const createdProductionUnits =
      await this.productionUnitRepository.createBulk(productionUnitEntities);

    return {
      fields: upsertedFields,
      productionUnits: createdProductionUnits,
      fieldCount: upsertedFields.length,
      productionUnitCount: createdProductionUnits.length,
    };
  }
}

type ImportProductionUnit = BulkImportDTO['productionUnits'][number];

function normalizeImportCycles(puData: ImportProductionUnit): ProductionUnitCycleCreateInput[] {
  const fallbackYear = new Date(puData.startDate).getUTCFullYear();
  const cycles =
    puData.cycles && puData.cycles.length > 0
      ? puData.cycles
      : [
          {
            cycleIndex: 1,
            cropName: puData.cropName,
            cropType: puData.cropType,
            variety: puData.variety,
            protocoll: puData.protocoll,
            protectionStructure: puData.protectionStructure,
            floweringDate: puData.floweringDate,
            harvestingDate: puData.harvestingDate,
            occupazione: puData.occupazione,
            destinazioneDiUso: puData.destinazioneDiUso,
            acquaTotalePeridoL: puData.acquaTotalePeridoL,
            seasonYear: fallbackYear,
          },
        ];
  return cycles
    .map((cycle, index) => ({
      cropName: cycle.cropName || 'N/A',
      cropType: cycle.cropType || 'N/A',
      variety: cycle.variety || 'N/A',
      protocoll: cycle.protocoll || 'N/A',
      protectionStructure: cycle.protectionStructure || 'N/A',
      floweringDate: cycle.floweringDate ? new Date(cycle.floweringDate) : null,
      harvestingDate: cycle.harvestingDate ? new Date(cycle.harvestingDate) : null,
      occupazione: cycle.occupazione ?? null,
      destinazioneDiUso: cycle.destinazioneDiUso ?? null,
      acquaTotalePeridoL: cycle.acquaTotalePeridoL ?? 0,
      seasonYear: cycle.seasonYear ?? fallbackYear,
      cycleIndex: cycle.cycleIndex || index + 1,
    }))
    .sort((left, right) => left.cycleIndex - right.cycleIndex);
}
