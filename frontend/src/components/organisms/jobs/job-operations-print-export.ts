import { buildTableExportParams } from '@/lib/table-export';
import type { ExportParams } from '@/lib/export';
import { formatDateForView, toIsoFromDateInput } from './mappers';
import { getVerificationStatusMeta } from './job-verification-status';
import {
  asObject,
  readScalar,
  type AlertNotes,
} from './alert-notes-helpers';
import type { JobOperationRow, JobRowDraft } from './types';
import type { JobOperationsTableRow } from './jobs-operations-table-types';

export interface JobOperationsPrintExportRow {
  readonly stato: string;
  readonly data: string;
  readonly faseFenologica: string;
  readonly unitaProduttiva: string;
  readonly prodotto: string;
  readonly principioAttivo: string;
  readonly quantitaTrattamento: string;
  readonly udm: string;
  readonly superficieHa: string;
  readonly doseMin: string;
  readonly doseMax: string;
  readonly doseMediaCalcolo: string;
  readonly umDose: string;
  readonly disponibileMagazzino: string;
  readonly malattieTarget: string;
  readonly noteMagazzino: string;
}

const NUMBER_FORMATTER = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const SURFACE_FORMATTER = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

function formatNumber(value: unknown): string {
  if (value == null || value === '') return '';
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return String(value);
  return NUMBER_FORMATTER.format(parsed);
}

function formatSurface(value: unknown): string {
  if (value == null || value === '') return '';
  const parsed = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(parsed)) return String(value);
  return SURFACE_FORMATTER.format(parsed);
}

function readNumericAlert(notes: AlertNotes | null, key: string): number | null {
  if (!notes) return null;
  const value = notes[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function computeAverageDose(doseMin: number | null, doseMax: number | null): string {
  if (doseMin != null && doseMax != null) {
    return formatNumber((doseMin + doseMax) / 2);
  }
  if (doseMin != null) return formatNumber(doseMin);
  if (doseMax != null) return formatNumber(doseMax);
  return '';
}

function resolveFaseFenologica(alertNotes: AlertNotes | null): string {
  return (
    readScalar(alertNotes, 'epoca_impiego_llm') ??
    readScalar(alertNotes, 'epoca_impiego') ??
    ''
  );
}

function parseLocalizedNumber(value: string): number | null {
  const normalized = value.trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveMalattieTarget(
  alertNotes: AlertNotes | null,
  avversity: unknown,
): string {
  if (alertNotes && Array.isArray(alertNotes.malattie)) {
    const malattie = alertNotes.malattie.filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    if (malattie.length > 0) return malattie.join(', ');
  }
  if (avversity == null) return '';
  if (typeof avversity === 'string') return avversity.trim();
  if (Array.isArray(avversity) && avversity.every((item) => typeof item === 'string')) {
    return avversity.join(', ');
  }
  return String(avversity);
}

function resolveJobRecord(operation: JobOperationRow): Record<string, unknown> {
  const wrappedJob = asObject(operation.raw.job);
  return wrappedJob ?? operation.raw;
}

function resolveEffectiveDateIso(
  operation: JobOperationRow,
  draft: JobRowDraft | undefined,
): string | null {
  if (draft?.dateIso) {
    return toIsoFromDateInput(draft.dateIso) ?? operation.dateIso;
  }
  return operation.dateIso;
}

function resolveEffectiveQuantity(
  operation: JobOperationRow,
  draft: JobRowDraft | undefined,
): number | null {
  if (draft?.quantity != null && draft.quantity.trim() !== '') {
    const parsed = parseLocalizedNumber(draft.quantity);
    if (parsed != null) return parsed;
  }
  return operation.quantity;
}

export function buildJobOperationsPrintExportRow(
  operation: JobOperationRow,
  draft: JobRowDraft | undefined,
): JobOperationsPrintExportRow {
  const isVerified = draft ? draft.isVerified : operation.isVerified;
  const meta = getVerificationStatusMeta({
    isVerified,
    conformityChecked: operation.conformityChecked,
  });
  const job = resolveJobRecord(operation);
  const alertNotes = asObject(operation.alertNotes) as AlertNotes | null;
  const doseMin = readNumericAlert(alertNotes, 'dose_minima');
  const doseMax = readNumericAlert(alertNotes, 'dose_massima');
  const dateIso = resolveEffectiveDateIso(operation, draft);
  const quantity = resolveEffectiveQuantity(operation, draft);

  return {
    stato: meta.label,
    data: dateIso ? formatDateForView(dateIso) : '—',
    faseFenologica: resolveFaseFenologica(alertNotes),
    unitaProduttiva: operation.productionUnitName || '—',
    prodotto: operation.productName || '—',
    principioAttivo: readScalar(alertNotes, 'principio_attivo') ?? '',
    quantitaTrattamento: quantity != null ? formatNumber(quantity) : '',
    udm: operation.unitOfMeasureQuantity?.trim() ?? '',
    superficieHa: formatSurface(job.treatedSurface),
    doseMin: doseMin != null ? formatNumber(doseMin) : '',
    doseMax: doseMax != null ? formatNumber(doseMax) : '',
    doseMediaCalcolo: computeAverageDose(doseMin, doseMax),
    umDose: readScalar(alertNotes, 'dose_um') ?? '',
    disponibileMagazzino: formatNumber(readNumericAlert(alertNotes, 'stock_in_warehouse')),
    malattieTarget: resolveMalattieTarget(alertNotes, job.avversity),
    noteMagazzino: job.note != null ? String(job.note).trim() : '',
  };
}

export const JOB_OPERATIONS_PRINT_COLUMNS = [
  { label: 'Stato', getValue: (row: JobOperationsPrintExportRow) => row.stato },
  { label: 'Data', getValue: (row: JobOperationsPrintExportRow) => row.data },
  { label: 'Fase fenologica', getValue: (row: JobOperationsPrintExportRow) => row.faseFenologica },
  { label: 'Unità Produttiva', getValue: (row: JobOperationsPrintExportRow) => row.unitaProduttiva },
  { label: 'Prodotto', getValue: (row: JobOperationsPrintExportRow) => row.prodotto },
  { label: 'Principio attivo', getValue: (row: JobOperationsPrintExportRow) => row.principioAttivo },
  { label: 'Quantità trattamento', getValue: (row: JobOperationsPrintExportRow) => row.quantitaTrattamento },
  { label: 'UDM', getValue: (row: JobOperationsPrintExportRow) => row.udm },
  { label: 'Superficie (ha)', getValue: (row: JobOperationsPrintExportRow) => row.superficieHa },
  { label: 'Dose min', getValue: (row: JobOperationsPrintExportRow) => row.doseMin },
  { label: 'Dose max', getValue: (row: JobOperationsPrintExportRow) => row.doseMax },
  { label: 'Dose Media Calcolo', getValue: (row: JobOperationsPrintExportRow) => row.doseMediaCalcolo },
  { label: 'UM dose', getValue: (row: JobOperationsPrintExportRow) => row.umDose },
  { label: 'Disponibile in magazzino', getValue: (row: JobOperationsPrintExportRow) => row.disponibileMagazzino },
  { label: 'Malattie target', getValue: (row: JobOperationsPrintExportRow) => row.malattieTarget },
  { label: 'Note Magazzino', getValue: (row: JobOperationsPrintExportRow) => row.noteMagazzino },
] as const;

export function buildJobOperationsPrintExportParams(input: {
  readonly tableRows: readonly JobOperationsTableRow[];
  readonly drafts: Readonly<Record<string, JobRowDraft>>;
  readonly filename: string;
}): ExportParams {
  const exportRows = input.tableRows
    .filter((row): row is JobOperationsTableRow & { kind: 'operation'; operation: JobOperationRow } =>
      row.kind === 'operation' && row.operation != null,
    )
    .map((row) => {
      const draft = row.draft ?? input.drafts[row.operation.id];
      return buildJobOperationsPrintExportRow(row.operation, draft);
    });

  return buildTableExportParams({
    columns: JOB_OPERATIONS_PRINT_COLUMNS,
    rows: exportRows,
    filename: input.filename,
  });
}
