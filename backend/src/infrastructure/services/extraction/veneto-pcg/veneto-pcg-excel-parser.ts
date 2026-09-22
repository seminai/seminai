import * as XLSX from 'xlsx';
import { isProductivePcgColtura } from '../../pcg-geojson-utils';
import { resolvePcgCropLabel } from '../../sisco-crop-lookup';
import { parseVenetoDate } from '../../agents/file_agent/template/veneto_file_structure';
import { parsePcgNumber, squareMetersToHectares } from './veneto-pcg-number-utils';
import type { VenetoPcgProductionRow } from './veneto-pcg-types';

type ExcelValue = string | number | boolean | Date | null | undefined;
type ExcelRow = Readonly<Record<string, ExcelValue>>;

export interface VenetoPcgExcelParseResult {
  readonly rows: readonly VenetoPcgProductionRow[];
  readonly totalRows: number;
}

export function parseVenetoPcgExcel(
  buffer: Buffer,
  sourceFileName: string,
): VenetoPcgExcelParseResult {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: null });
  return {
    totalRows: rows.length,
    rows: rows.flatMap((row, index) => mapProductiveRow(row, index + 2, sourceFileName)),
  };
}

function mapProductiveRow(
  row: ExcelRow,
  rowNumber: number,
  sourceFileName: string,
): readonly VenetoPcgProductionRow[] {
  const coltura = toStringValue(row.coltura);
  if (!isProductivePcgColtura(coltura)) return [];
  const areaHa = squareMetersToHectares(row.area);
  const particelle = toStringValue(row.particelle);
  if (!areaHa || !particelle) return [];
  const crop = resolvePcgCropLabel(coltura, toStringValue(row.cod_coltura));
  return [
    {
      rowNumber,
      sourceFileName,
      particelle,
      idPoligono: toStringValue(row.id_poligono),
      cropCode: toStringValue(row.cod_coltura),
      cropName: crop.cropName || crop.uso,
      cropType: crop.cropType || toStringValue(row.cod_coltura) || 'N/A',
      uso: crop.uso,
      areaHa,
      startDate: parsePcgExcelDate(row.data_inizio_coltura),
      endDate: parsePcgExcelDate(row.data_fine_coltura),
      variety: toStringValue(row.varieta_prevalente),
      protectionStructure: toStringValue(row.sistema_di_protezione),
      maintenance:
        toStringValue(row.mantenimento_sup_agricole) ??
        toStringValue(row.mantenimento_prati_permanenti),
    },
  ];
}

function parsePcgExcelDate(value: ExcelValue): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return parseExcelSerialDate(value);
  const raw = toStringValue(value);
  if (!raw) return null;
  const asNumber = parsePcgNumber(raw);
  if (asNumber && /^\d+(\.\d+)?$/.test(raw)) return parseExcelSerialDate(asNumber);
  return parseVenetoDate(raw);
}

function parseExcelSerialDate(value: number): string | null {
  const parsed = XLSX.SSF.parse_date_code(value);
  if (!parsed) return null;
  const month = String(parsed.m).padStart(2, '0');
  const day = String(parsed.d).padStart(2, '0');
  return `${parsed.y}-${month}-${day}`;
}

function toStringValue(value: ExcelValue): string | null {
  if (value === null || value === undefined) return null;
  const stringValue = String(value).trim();
  return stringValue.length > 0 ? stringValue : null;
}
