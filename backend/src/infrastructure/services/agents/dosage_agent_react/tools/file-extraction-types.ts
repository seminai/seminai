/**
 * Shared types for file extraction (CSV/Excel/PDF/Shapefile).
 * Used by pdf-extractor.ts, csv-excel-extractor.ts, shapefile-handler.ts, and extract-from-file.tool.ts.
 */

export interface StockPreviewEntry {
  readonly name: string;
  readonly category: string;
  readonly registrationNumber: string | null;
  readonly stock: {
    readonly quantity: number;
    readonly unitOfMeasureQuantity: string;
    readonly price: number;
    readonly type: 'IN' | 'OUT';
    readonly ddtCode: string;
    readonly ddtDate: string;
    readonly invoiceCode: string | null;
    readonly companySupplierName: string | null;
  };
}

export interface FieldExtracted {
  readonly nome?: string;
  readonly name?: string;
  readonly foglio?: string;
  readonly particella?: string;
  readonly sezione?: string | null;
  readonly comune?: string;
  readonly superficieCatastaleHa?: number | null;
  readonly sauHa?: number | null;
  readonly usiSuolo?: string[];
  readonly qualita?: string | null;
  readonly latitude?: number | null;
  readonly longitude?: number | null;
  readonly coordinates?: number[];
  readonly polygon?: { type: string; coordinates: number[][][] } | null;
  readonly coordinatesGaussBoaga?: number[] | null;
  readonly polygonGaussBoaga?: { type: string; coordinates: number[][][] } | null;
  readonly superficieCatastaleMq?: number | null;
  readonly gisHa?: number | null;
  readonly nation?: string | null;
  readonly region?: string | null;
  readonly soilType?: string | null;
  readonly inizioConduzione?: string | null;
  readonly fineConduzione?: string | null;
}

export interface ProductionUnitCycleExtracted {
  readonly cropName?: string | null;
  readonly variety?: string | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
}

export interface ProductionUnitExtracted {
  readonly name?: string;
  readonly foglio?: string | null;
  readonly particella?: string | null;
  readonly areaHa?: number | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly cycles?: ProductionUnitCycleExtracted[];
  readonly allocations?: Array<{
    readonly foglio?: string | null;
    readonly particella?: string | null;
  }>;
  readonly fieldIndex?: number;
  readonly cropType?: string | null;
  readonly protocoll?: string | null;
  readonly protectionStructure?: string | null;
  readonly destinazioneDiUso?: string | null;
}

export interface CompanyExtracted {
  readonly name?: string;
  readonly vatNumber?: string | null;
  readonly fiscalCode?: string | null;
  readonly city?: string | null;
}
