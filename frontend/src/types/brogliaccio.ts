export type BrogliaccioExtractionStatus = 'extracted' | 'failed';

export interface BrogliaccioRawEntry {
  readonly date: string;
  readonly productionUnitName: string | null;
  readonly areaHa: number | null;
  readonly productName: string;
  readonly quantity: number;
  readonly unitOfMeasure: string;
  readonly waterQuantityL: number | null;
}

export interface BrogliaccioStockProduct {
  readonly name: string;
  readonly category: 'PESTICIDE';
  readonly type: 'Fitosanitario';
  readonly registrationNumber: string | null;
}

export interface BrogliaccioStock {
  readonly product: BrogliaccioStockProduct;
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly type: 'OUT';
}

export interface BrogliaccioJobPayload {
  readonly productionUnitName: string | null;
  readonly dateOfOpeation: string;
  readonly category: 'TREATMENT';
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly treatedSurface: number | null;
  readonly totalDistributedWaterL: number | null;
  readonly stocks: readonly BrogliaccioStock[];
}

export interface BrogliaccioExtractionFileResult {
  readonly fileName: string;
  readonly status: BrogliaccioExtractionStatus;
  readonly rawEntries: readonly BrogliaccioRawEntry[];
  readonly payload: readonly BrogliaccioJobPayload[];
  readonly error?: string;
}

export interface ExtractBrogliacciResponse {
  readonly status: string;
  readonly data: {
    readonly results: readonly BrogliaccioExtractionFileResult[];
  };
}
