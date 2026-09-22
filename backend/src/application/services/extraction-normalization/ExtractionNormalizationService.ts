import { IFieldRepository } from '../../../domain/repositories/IFieldRepository';
import { IProductionUnitRepository } from '../../../domain/repositories/IProductionUnitRepository';
import type {
  FieldExtracted,
  ProductionUnitCycleExtracted,
  ProductionUnitExtracted,
} from '../../../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';
import {
  dedupExtractedFields,
  groupRowsIntoProductionUnits,
} from './extraction-normalization.functions';
import type {
  NormalizedExtraction,
  NormalizedField,
  NormalizedProductionUnit,
  OccupationInfo,
} from './normalized-extraction.types';

interface ProductionUnitInputRow {
  readonly cropType: string | null;
  readonly protocoll: string | null;
  readonly cycle: ProductionUnitCycleExtracted;
  readonly allocations: ReadonlyArray<{
    readonly foglio: string;
    readonly particella: string;
    readonly areaHa: number;
  }>;
}

interface NormalizeInput {
  readonly companyId: string;
  readonly raw: {
    readonly fields: ReadonlyArray<FieldExtracted>;
    readonly productionUnits: ReadonlyArray<ProductionUnitExtracted>;
  };
}

export class ExtractionNormalizationService {
  constructor(
    private readonly fieldRepository: IFieldRepository,
    private readonly productionUnitRepository: IProductionUnitRepository,
  ) {}

  async normalize({ companyId, raw }: NormalizeInput): Promise<NormalizedExtraction> {
    const dedupedFields = dedupExtractedFields(raw.fields);
    const fieldsWithExistence = await this.resolveExistingFields(dedupedFields, companyId);
    const rawRows = this.buildRawRows(raw.productionUnits, fieldsWithExistence);
    const productionUnits = groupRowsIntoProductionUnits(fieldsWithExistence, rawRows);
    const fields = await this.markOccupiedFields(fieldsWithExistence, productionUnits);
    const stats = {
      fieldsNew: fields.filter((field) => field.status === 'new').length,
      fieldsExisting: fields.filter((field) => field.status === 'existing').length,
      fieldsOccupied: fields.filter((field) => field.status === 'occupied').length,
      productionUnitsGrouped: productionUnits.length,
      rawRowsProcessed: rawRows.length,
    };
    return { fields, productionUnits, stats };
  }

  private async resolveExistingFields(
    dedupedFields: ReadonlyArray<NormalizedField>,
    companyId: string,
  ): Promise<NormalizedField[]> {
    return Promise.all(
      dedupedFields.map(async (field) => {
        if (!field.foglio || !field.particella) {
          return field;
        }
        const existing = await this.fieldRepository.findByCadastralReference({
          companyId,
          sezione: field.sezione ?? null,
          foglio: field.foglio,
          particella: field.particella,
          subalterno: (field as { subalterno?: string | null }).subalterno ?? null,
        });
        if (!existing) {
          return field;
        }
        return { ...field, status: 'existing', existingFieldId: existing.id };
      }),
    );
  }

  private buildRawRows(
    productionUnits: ReadonlyArray<ProductionUnitExtracted>,
    fields: ReadonlyArray<NormalizedField>,
  ): ProductionUnitInputRow[] {
    const rows: ProductionUnitInputRow[] = [];
    for (const unit of productionUnits) {
      const cycles = unit.cycles && unit.cycles.length > 0 ? unit.cycles : this.fallbackCycle(unit);
      const allocations = this.resolveAllocations(unit, fields);
      if (allocations.length === 0) {
        continue;
      }
      for (const cycle of cycles) {
        rows.push({
          cropType: unit.cropType ?? null,
          protocoll: unit.protocoll ?? null,
          cycle,
          allocations,
        });
      }
    }
    return rows;
  }

  private fallbackCycle(unit: ProductionUnitExtracted): ProductionUnitCycleExtracted[] {
    if (!unit.startDate && !unit.endDate) {
      return [];
    }
    return [
      {
        cropName: null,
        variety: null,
        startDate: unit.startDate ?? null,
        endDate: unit.endDate ?? null,
      },
    ];
  }

  private resolveAllocations(
    unit: ProductionUnitExtracted,
    fields: ReadonlyArray<NormalizedField>,
  ): ReadonlyArray<{ foglio: string; particella: string; areaHa: number }> {
    if (unit.allocations && unit.allocations.length > 0) {
      const totalArea = unit.areaHa ?? 0;
      const perAllocation = unit.allocations.length > 0 ? totalArea / unit.allocations.length : 0;
      return unit.allocations
        .filter((allocation) => allocation.foglio && allocation.particella)
        .map((allocation) => ({
          foglio: allocation.foglio as string,
          particella: allocation.particella as string,
          areaHa: perAllocation,
        }));
    }
    if (typeof unit.fieldIndex === 'number') {
      const field = fields[unit.fieldIndex];
      if (field?.foglio && field.particella) {
        return [
          {
            foglio: field.foglio,
            particella: field.particella,
            areaHa: unit.areaHa ?? field.sauHa ?? 0,
          },
        ];
      }
    }
    if (unit.foglio && unit.particella) {
      return [
        {
          foglio: unit.foglio,
          particella: unit.particella,
          areaHa: unit.areaHa ?? 0,
        },
      ];
    }
    return [];
  }

  private async markOccupiedFields(
    fields: ReadonlyArray<NormalizedField>,
    productionUnits: ReadonlyArray<NormalizedProductionUnit>,
  ): Promise<NormalizedField[]> {
    const fieldToUnits = new Map<string, NormalizedProductionUnit[]>();
    for (const unit of productionUnits) {
      for (const allocation of unit.allocations) {
        const bucket = fieldToUnits.get(allocation.fieldTempId) ?? [];
        bucket.push(unit);
        fieldToUnits.set(allocation.fieldTempId, bucket);
      }
    }
    return Promise.all(
      fields.map(async (field) => {
        if (field.status !== 'existing' || !field.existingFieldId) {
          return field;
        }
        const candidateUnits = fieldToUnits.get(field.tempId) ?? [];
        if (candidateUnits.length === 0) {
          return field;
        }
        const range = this.computeRange(candidateUnits);
        const overlapping = await this.productionUnitRepository.findOverlappingByField(
          field.existingFieldId,
          range,
        );
        if (overlapping.length === 0) {
          return field;
        }
        const occupiedBy: OccupationInfo[] = overlapping.map((row) => ({
          productionUnitId: row.productionUnitId,
          productionUnitName: row.productionUnitName,
          cropName: row.cropName,
          startDate: row.startDate.toISOString(),
          endDate: row.endDate.toISOString(),
          areaHaUsed: row.areaHaOnField,
        }));
        return { ...field, status: 'occupied' as const, occupiedBy };
      }),
    );
  }

  private computeRange(units: ReadonlyArray<NormalizedProductionUnit>): {
    startDate: Date;
    endDate: Date;
  } {
    const starts = units.map((unit) => new Date(unit.startDate).getTime()).filter(Number.isFinite);
    const ends = units.map((unit) => new Date(unit.endDate).getTime()).filter(Number.isFinite);
    const start = starts.length > 0 ? Math.min(...starts) : Date.now();
    const end = ends.length > 0 ? Math.max(...ends) : Date.now();
    return { startDate: new Date(start), endDate: new Date(end) };
  }
}
