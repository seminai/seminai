import type {
  JobWithAssignmentDTO,
  JobWithAssignmentWithoutHistoryDTO,
} from '../../../../../../domain/dtos/job-assignment.dto';
import type { FieldNoteListItem } from '../../../../tool/listUserFieldNotes';

export interface OperationSummaryItem {
  readonly date: string;
  readonly source: string;
  readonly companyName: string;
  readonly productionUnitName: string;
  readonly cropName: string;
  readonly products: string;
  readonly quantity: string;
  readonly target: string;
}

export function formatOperationSummariesMarkdown(items: readonly OperationSummaryItem[]): string {
  const rows = [
    '| # | Data | Fonte | Azienda | UP/Campo | Coltura | Prodotto | Quantita | Avversita/Note |',
    '|---|------|-------|---------|----------|---------|----------|----------|----------------|',
    ...items.map(
      (item, index) =>
        `| ${index + 1} | ${item.date} | ${escapeCell(item.source)} | ${escapeCell(item.companyName)} | ${escapeCell(item.productionUnitName)} | ${escapeCell(item.cropName)} | ${escapeCell(item.products)} | ${escapeCell(item.quantity)} | ${escapeCell(item.target)} |`,
    ),
  ];
  return rows.join('\n');
}

export function mapVerifiedJobToSummary(item: JobWithAssignmentDTO): OperationSummaryItem {
  return mapJobToSummary(item, 'Archivio verificato');
}

export function mapUnverifiedJobToSummary(
  item: JobWithAssignmentWithoutHistoryDTO,
): OperationSummaryItem {
  return mapJobToSummary(item, 'Archivio da validare');
}

export function mapFieldNoteToSummary(item: FieldNoteListItem): OperationSummaryItem {
  return {
    date: formatDate(new Date(item.operationDate)),
    source: 'Nota di campo',
    companyName: item.companyName ?? '-',
    productionUnitName: item.productionUnitName ?? item.fieldName ?? '-',
    cropName: '-',
    products: item.productName ?? '-',
    quantity: formatQuantity(item.quantity, item.unitOfMeasure),
    target: item.rawContentPreview || '-',
  };
}

function mapJobToSummary(
  item: JobWithAssignmentDTO | JobWithAssignmentWithoutHistoryDTO,
  source: string,
): OperationSummaryItem {
  return {
    date: formatDate(item.job.dateOfOpeation),
    source,
    companyName: item.company.name,
    productionUnitName: item.productionUnit.name,
    cropName: [item.productionUnit.cropName, item.productionUnit.cropType]
      .filter(Boolean)
      .join(' / '),
    products: item.products.map((product) => product.name).join(', ') || '-',
    quantity: formatQuantity(item.job.quantity, item.job.unitOfMeasureQuantity),
    target: item.job.avversity ?? item.job.note ?? '-',
  };
}

function formatDate(date: Date): string {
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('it-IT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatQuantity(value: number | null, unit: string | null): string {
  if (value === null || !Number.isFinite(value)) return '-';
  const formattedValue = value.toLocaleString('it-IT', {
    maximumFractionDigits: 4,
  });
  return [formattedValue, unit].filter(Boolean).join(' ');
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
