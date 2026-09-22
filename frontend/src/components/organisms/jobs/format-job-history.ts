import { sanitizeUserFacingValue } from '@/lib/safe-display';
import type { HistoryEntry, JobOperationRow } from './types';
import { dataSourceIt, jobCategoryIt, jobFieldLabelIt } from './job-detail-italian-labels';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function formatTimestampIt(value: unknown): string {
  if (value == null) return '—';
  const raw = String(value).trim();
  if (!raw) return '—';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return sanitizeUserFacingValue(value);
  return date.toLocaleString('it-IT', { dateStyle: 'short', timeStyle: 'medium' });
}

function formatMetadataIt(metadata: unknown): string {
  const record = asRecord(metadata);
  if (!record) return sanitizeUserFacingValue(metadata);
  const lines = Object.entries(record).map(([key, val]) => {
    const label = jobFieldLabelIt(key);
    const text =
      val != null && typeof val === 'object' && !Array.isArray(val)
        ? JSON.stringify(val, null, 2)
        : sanitizeUserFacingValue(val);
    return `  • ${label}: ${text}`;
  });
  return lines.join('\n');
}

const SNAPSHOT_SUMMARY_KEYS = [
  'category',
  'quantity',
  'unitOfMeasureQuantity',
  'dateOfOpeation',
  'isVerified',
  'conformityChecked',
  'note',
  'machineId',
  'productionUnitId',
] as const;

function formatPreviousSnapshotIt(snapshot: unknown): string {
  const record = asRecord(snapshot);
  if (!record) return '';
  const lines: string[] = [];
  for (const key of SNAPSHOT_SUMMARY_KEYS) {
    const val = record[key];
    if (val === undefined || val === null) continue;
    lines.push(`  • ${jobFieldLabelIt(key)}: ${sanitizeUserFacingValue(val)}`);
  }
  if (lines.length === 0) return '';
  return ['Riepilogo stato prima della modifica:', ...lines].join('\n');
}

function formatModificationEntry(item: Record<string, unknown>, operationLabel: string): string {
  const when = formatTimestampIt(item.timestamp);
  const modifiedBy = asRecord(item.modifiedBy);
  const who = modifiedBy
    ? `${sanitizeUserFacingValue(modifiedBy.name)} (${sanitizeUserFacingValue(modifiedBy.email)})`
    : '—';
  const changes = Array.isArray(item.changes) ? item.changes : [];
  const changeLines = changes.map((ch, idx) => {
    const c = asRecord(ch);
    if (!c) return `  ${idx + 1}. ${sanitizeUserFacingValue(ch)}`;
    const field = jobFieldLabelIt(String(c.field ?? ''));
    const from = sanitizeUserFacingValue(c.oldValue);
    const to = sanitizeUserFacingValue(c.newValue);
    return `  ${idx + 1}. ${field}: da «${from}» a «${to}»`;
  });
  const snapshotBlock = formatPreviousSnapshotIt(item.previousJobSnapshot);
  return [
    `${operationLabel} — Modifica manuale`,
    `Data e ora: ${when}`,
    `Modificato da: ${who}`,
    changeLines.length > 0 ? 'Modifiche:\n' + changeLines.join('\n') : '',
    snapshotBlock,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function formatStepEntry(item: Record<string, unknown>, operationLabel: string): string {
  const title = sanitizeUserFacingValue(item.title ?? item.step ?? 'Evento');
  const value = sanitizeUserFacingValue(item.value);
  const source = dataSourceIt(String(item.source ?? ''));
  const when = formatTimestampIt(item.timestamp);
  const meta = item.metadata != null ? `\nDettagli:\n${formatMetadataIt(item.metadata)}` : '';
  return [
    `${operationLabel}`,
    `Titolo: ${title}`,
    `Esito: ${value}`,
    `Origine: ${source}`,
    `Data e ora: ${when}`,
    meta,
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

function formatHistoryItem(entry: unknown, index: number, operationLabel: string): string {
  const item = asRecord(entry);
  if (!item) return `${operationLabel} — Evento ${index + 1}: ${sanitizeUserFacingValue(entry)}`;
  const type = String(item.type ?? '');
  if (type === 'modification') return formatModificationEntry(item, operationLabel);
  if (item.step != null || item.title != null) return formatStepEntry(item, operationLabel);
  return `${operationLabel} — Evento ${index + 1}\n${JSON.stringify(item, null, 2)}`;
}

export function mapHistoryEntriesItalian(selectedRows: readonly JobOperationRow[]): HistoryEntry[] {
  return selectedRows.flatMap((row) => {
    const operationLabel =
      row.productName !== '-' ? `Operazione: ${row.productName}` : `Operazione (${jobCategoryIt(row.category)})`;
    if (Array.isArray(row.history)) {
      if (row.history.length === 0) {
        return [
          {
            key: `${row.id}-empty-history`,
            operationId: row.id,
            text: `${operationLabel}\nNessun evento in cronologia.`,
          },
        ] satisfies HistoryEntry[];
      }
      return row.history.map((entry, index) => ({
        key: `${row.id}-history-${index}`,
        operationId: row.id,
        text: formatHistoryItem(entry, index, operationLabel),
      }));
    }
    const historyRecord = asRecord(row.history);
    if (!historyRecord) {
      return [
        {
          key: `${row.id}-empty-history`,
          operationId: row.id,
          text: `${operationLabel}\nNessun evento in cronologia.`,
        },
      ] satisfies HistoryEntry[];
    }
    const entries = Object.entries(historyRecord);
    if (entries.length === 0) {
      return [
        {
          key: `${row.id}-empty-history`,
          operationId: row.id,
          text: `${operationLabel}\nNessun evento in cronologia.`,
        },
      ] satisfies HistoryEntry[];
    }
    return entries.map(([key, value], index) => ({
      key: `${row.id}-${key}-${index}`,
      operationId: row.id,
      text: `${operationLabel}\n${jobFieldLabelIt(key)}: ${sanitizeUserFacingValue(value)}`,
    }));
  });
}
