import type {
  FieldExtracted,
  ProductionUnitCycleExtracted,
} from '../../../infrastructure/services/agents/dosage_agent_react/tools/file-extraction-types';

export type FieldStatus = 'new' | 'existing' | 'occupied';

export interface OccupationInfo {
  readonly productionUnitId: string;
  readonly productionUnitName: string;
  readonly cropName: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly areaHaUsed: number;
}

export interface NormalizedField extends FieldExtracted {
  readonly tempId: string;
  readonly status: FieldStatus;
  readonly existingFieldId?: string;
  readonly occupiedBy?: ReadonlyArray<OccupationInfo>;
}

export interface GroupingKey {
  readonly cropName: string;
  readonly comune: string;
  readonly foglio: string;
  readonly usoSuoloPrimario: string | null;
  readonly usoSuoloSecondario: string | null;
}

export interface NormalizedAllocation {
  readonly fieldTempId: string;
  readonly foglio: string;
  readonly particella: string;
  readonly areaHa: number;
}

export interface NormalizedProductionUnit {
  readonly tempId: string;
  readonly name: string;
  readonly groupingKey: GroupingKey;
  readonly cropName: string;
  readonly cropType: string | null;
  readonly variety: string | null;
  readonly protocoll: string | null;
  readonly startDate: string;
  readonly endDate: string;
  readonly areaHa: number;
  readonly allocations: ReadonlyArray<NormalizedAllocation>;
  readonly cycles: ReadonlyArray<ProductionUnitCycleExtracted>;
}

export interface NormalizedExtractionStats {
  readonly fieldsNew: number;
  readonly fieldsExisting: number;
  readonly fieldsOccupied: number;
  readonly productionUnitsGrouped: number;
  readonly rawRowsProcessed: number;
}

export interface NormalizedExtraction {
  readonly fields: ReadonlyArray<NormalizedField>;
  readonly productionUnits: ReadonlyArray<NormalizedProductionUnit>;
  readonly stats: NormalizedExtractionStats;
}

export type FieldOccupationDecision = 'skip' | 'reuse' | 'force_new';
