import type { Label } from '../../domain/dtos/label.dto';
import type { ProductionUnit } from '../../domain/entities/ProductionUnit';
import type {
  BulkCreateJobItemDTO,
  BulkStockItemDTO,
} from '../use-cases/job/BulkCreateProductAndJobUseCase';
import type { findCropTaxonomyContext } from '../../infrastructure/services/agents/dosage_agent/cropTaxonomyProvider';

export interface UnmatchedProductWarning {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly reason: string;
}

export interface ResolveItemsResult {
  readonly resolvedItems: BulkCreateJobItemDTO[];
  readonly warnings: UnmatchedProductWarning[];
}

export interface ResolvedProduct {
  stockItem: BulkStockItemDTO;
  name: string;
  registrationNumber: string;
  label: Label | null;
  labelError?: string;
  isFertilizer?: boolean;
}

export interface CropGroup {
  readonly cropName: string;
  readonly variety: string;
  readonly taxonomy: ReturnType<typeof findCropTaxonomyContext>;
  readonly pus: Array<{ id: string; areaHa: number }>;
}

export interface UserProductionUnit {
  readonly productionUnit: ProductionUnit;
  readonly companyId: string;
  readonly companyName: string;
  readonly field: {
    readonly id: string;
    readonly name: string;
    readonly sauHa: number | null;
    readonly gisHa: number | null;
  };
  readonly areaHaOnField: number;
}

export interface ProductProductionUnitMatch {
  readonly puId: string;
  readonly confidence: number;
}
