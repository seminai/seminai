import { readFile } from 'fs/promises';
import path from 'path';

interface DisciplinariField {
  readonly type: string;
  readonly value: string;
}

export interface DisciplinariEntry {
  readonly name: string;
  readonly registrationNumber: string;
  readonly area?: string;
  readonly data: readonly DisciplinariField[];
}

interface GetDisciplinariParams {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly datasetPath?: string;
}

const DEFAULT_DATASET_PATHS: readonly string[] = [
  path.resolve(process.cwd(), 'dataset', 'bdf', 'disciplinari_emilia_romagna_partial.csv'),
  path.resolve(process.cwd(), 'dataset', 'bdf', 'disciplinari_piemonte_partial.csv'),
];
const CSV_SPLIT_REGEX: RegExp = /;(?=(?:[^"]*"[^"]*")*[^"]*$)/;

function normalizeHeader(header: string): string {
  return header
    .replace(/\uFEFF/g, '')
    .replace(/^"|"$/g, '')
    .trim();
}

function normalizeValue(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/^"|"$/g, '').trim();
}

function normalizeProductName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function buildRow(headers: readonly string[], values: readonly string[]): Record<string, string> {
  const row: Record<string, string> = {};
  headers.forEach((header, index) => {
    row[header] = normalizeValue(values[index]);
  });
  return row;
}

function buildRowHash(row: Record<string, string>, headers: readonly string[]): string {
  const orderedEntries = headers.map((header) => `${header}=${row[header] ?? ''}`);
  return orderedEntries.join('|');
}

interface NormalizedParams {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly datasetPaths: readonly string[];
}

function ensureParams(params: GetDisciplinariParams): NormalizedParams {
  const name = params.productName?.trim();
  const registrationNumber = params.registrationNumber?.trim();
  if (!name) throw new Error('Product name is required');
  if (!registrationNumber) throw new Error('Registration number is required');
  const datasetPaths = params.datasetPath?.trim().length
    ? [params.datasetPath]
    : DEFAULT_DATASET_PATHS;
  return {
    productName: name,
    registrationNumber,
    datasetPaths,
  };
}

async function readDataset(datasetPath: string): Promise<string> {
  return readFile(datasetPath, { encoding: 'utf-8' });
}

function parseHeaders(line: string): readonly string[] {
  return line.split(CSV_SPLIT_REGEX).map((header) => normalizeHeader(header));
}

function parseLines(csvContent: string): readonly string[] {
  return csvContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
}

/**
 * Reads the BDF disciplinari dataset and returns unique rows grouped by product name and registration number.
 */
export async function getDisciplinariFromBDF(
  params: GetDisciplinariParams,
): Promise<readonly DisciplinariEntry[]> {
  const { productName, registrationNumber, datasetPaths } = ensureParams(params);
  const normalizedName = normalizeProductName(productName);
  const normalizedReg = registrationNumber;
  const results: DisciplinariEntry[] = [];
  const deduplicationSet = new Set<string>();
  for (const currentDatasetPath of datasetPaths) {
    const csvContent = await readDataset(currentDatasetPath);
    const lines = parseLines(csvContent);
    if (lines.length <= 1) continue;
    const headers = parseHeaders(lines[0]);
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(CSV_SPLIT_REGEX);
      const row = buildRow(headers, parts);
      const rowName = normalizeProductName(row['NOME_COMMERCIALE'] ?? '');
      const rowReg = row['NUM_REG'] ?? '';
      if (rowName !== normalizedName) continue;
      if (rowReg !== normalizedReg) continue;
      const rowHash = buildRowHash(row, headers);
      if (deduplicationSet.has(rowHash)) continue;
      deduplicationSet.add(rowHash);
      const data = headers.map((header) => ({
        type: header,
        value: row[header] ?? '',
      }));
      const area = row['DECO_REGIONE']?.trim() || undefined;
      results.push({
        name: row['NOME_COMMERCIALE'] ?? '',
        registrationNumber: rowReg,
        area,
        data,
      });
    }
  }
  return results;
}
