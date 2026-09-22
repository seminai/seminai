import path from 'node:path';
import AdmZip from 'adm-zip';
import { FieldCsvAgent, type ExtractedFieldData } from '../agents/file_agent/field_csv_agent';
import {
  ProductionUnitCsvAgent,
  type ProductionUnitExtractionResult,
} from '../agents/production_unit/production_unit_csv_agent';
import { PianoColturalePdfAgent } from '../agents/file_agent/piano_colturale_pdf_agent';
import { createDiagnostics } from '../agents/file_agent/utils/csv_parser';

interface Candidate<T> {
  readonly entryName: string;
  readonly count: number;
  readonly result: T;
}

interface EntryError {
  readonly entryName: string;
  readonly parser: 'fields' | 'production_units' | 'pdf';
  readonly message: string;
}

export interface AgriculturalZipTableExtraction {
  readonly fieldsResult: ExtractedFieldData;
  readonly productionUnitResult: ProductionUnitExtractionResult;
  readonly diagnostics: {
    readonly source: 'agricultural_zip_tables';
    readonly inspectedEntries: readonly string[];
    readonly selectedFieldEntry: string | null;
    readonly selectedProductionUnitEntry: string | null;
    readonly errors: readonly EntryError[];
  };
}

const TABLE_ENTRY_PATTERN = /\.(csv|xlsx?|xlsm|xlsb|ods)$/i;

export async function extractAgriculturalZipTables(
  buffer: Buffer,
): Promise<AgriculturalZipTableExtraction> {
  const entries = new AdmZip(buffer).getEntries().filter((entry) => !entry.isDirectory);
  const inspectedEntries = entries.map((entry) => entry.entryName);
  const fieldAgent = new FieldCsvAgent();
  const productionUnitAgent = new ProductionUnitCsvAgent();
  const pdfAgent = new PianoColturalePdfAgent();
  const errors: EntryError[] = [];
  let bestFields: Candidate<ExtractedFieldData> | null = null;
  let bestProductionUnits: Candidate<ProductionUnitExtractionResult> | null = null;

  for (const entry of entries) {
    const entryName = entry.entryName;
    const basename = path.basename(entryName);
    const data = entry.getData();

    if (TABLE_ENTRY_PATTERN.test(basename)) {
      bestFields = await keepBest(
        bestFields,
        entryName,
        () => fieldAgent.extractFieldsFromCsv(data),
        (result) => result.fields.length,
        errors,
        'fields',
      );
      bestProductionUnits = await keepBest(
        bestProductionUnits,
        entryName,
        () => productionUnitAgent.extractProductionUnitsFromCsv(data),
        (result) => result.units.length,
        errors,
        'production_units',
      );
      continue;
    }

    if (/\.pdf$/i.test(basename)) {
      try {
        const result = await pdfAgent.extractFromPdf(data, () => undefined);
        bestFields = chooseCandidate(bestFields, {
          entryName,
          count: result.fields.fields.length,
          result: result.fields,
        });
        bestProductionUnits = chooseCandidate(bestProductionUnits, {
          entryName,
          count: result.productionUnits.units.length,
          result: result.productionUnits,
        });
      } catch (error) {
        errors.push({
          entryName,
          parser: 'pdf',
          message: error instanceof Error ? error.message : 'PDF extraction failed',
        });
      }
    }
  }

  if (!bestFields && !bestProductionUnits) {
    throw new Error('ZIP agricultural extraction found no parseable table or PDF entries');
  }

  return {
    fieldsResult: bestFields?.result ?? { fields: [], diagnostics: createDiagnostics(0, 'zip') },
    productionUnitResult: bestProductionUnits?.result ?? {
      units: [],
      diagnostics: createDiagnostics(0, 'zip'),
    },
    diagnostics: {
      source: 'agricultural_zip_tables',
      inspectedEntries,
      selectedFieldEntry: bestFields?.entryName ?? null,
      selectedProductionUnitEntry: bestProductionUnits?.entryName ?? null,
      errors,
    },
  };
}

async function keepBest<T>(
  current: Candidate<T> | null,
  entryName: string,
  extract: () => Promise<T>,
  countItems: (result: T) => number,
  errors: EntryError[],
  parser: EntryError['parser'],
): Promise<Candidate<T> | null> {
  try {
    const result = await extract();
    return chooseCandidate(current, {
      entryName,
      result,
      count: countItems(result),
    });
  } catch (error) {
    errors.push({
      entryName,
      parser,
      message: error instanceof Error ? error.message : 'Entry extraction failed',
    });
    return current;
  }
}

function chooseCandidate<T>(current: Candidate<T> | null, next: Candidate<T>): Candidate<T> {
  if (!current || next.count > current.count) return next;
  return current;
}
