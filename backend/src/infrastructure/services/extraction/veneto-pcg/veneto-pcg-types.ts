import type { ProductionUnitPreview } from '../../../../domain/dtos/file-extraction.dto';
import type { ShapefileExtractedField } from '../../shapefile-parser';

export interface VenetoPcgFieldRecord {
  readonly field: ShapefileExtractedField;
  readonly codiceNazionale: string;
  readonly surfaceMq: number;
}

export interface VenetoPcgProductionRow {
  readonly rowNumber: number;
  readonly sourceFileName: string;
  readonly particelle: string;
  readonly idPoligono: string | null;
  readonly cropCode: string | null;
  readonly cropName: string;
  readonly cropType: string;
  readonly uso: string;
  readonly areaHa: number;
  readonly startDate: string | null;
  readonly endDate: string | null;
  readonly variety: string | null;
  readonly protectionStructure: string | null;
  readonly maintenance: string | null;
}

export interface VenetoPcgUnmatchedReference {
  readonly rowNumber: number;
  readonly sourceFileName: string;
  readonly particelle: string;
  readonly comune: string;
  readonly codiceNazionale: string | null;
  readonly sezione: string | null;
  readonly foglio: string;
  readonly particella: string;
  readonly reason: 'unknown_comune' | 'missing_field' | 'invalid_particelle';
}

export interface VenetoPcgDiagnostics {
  readonly source: 'veneto_pcg_zip';
  readonly fields: number;
  readonly productionUnits: number;
  readonly excelRows: number;
  readonly productiveRows: number;
  readonly unmatchedReferences: readonly VenetoPcgUnmatchedReference[];
  readonly sourceFiles: readonly string[];
  readonly totalRecords: number;
  readonly shapeType: string;
  readonly sourceCrs: string;
}

export interface VenetoPcgExtractionResult {
  readonly fields: readonly ShapefileExtractedField[];
  readonly productionUnits: readonly ProductionUnitPreview[];
  readonly diagnostics: VenetoPcgDiagnostics;
}
