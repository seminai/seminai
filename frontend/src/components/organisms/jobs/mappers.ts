import { extractArray } from '@/lib/api-response';
import type { JobGroupRow, JobOperationRow, JobRowDraft } from './types';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown, fallback = '-'): string {
  if (value == null) return fallback;
  const output = String(value).trim();
  return output.length > 0 ? output : fallback;
}

function toNumberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function formatDateForView(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('it-IT');
}

export function toDateInputValue(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toIsoFromDateInput(value: string): string | null {
  if (!value) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** True if draft differs from server operation or is a new row pending create. */
export function jobOperationDraftHasPendingChanges(
  draft: JobRowDraft,
  operation: JobOperationRow | undefined,
): boolean {
  if (draft.isNew) return true;
  if (!operation) return false;
  const quantity = Number.parseFloat(draft.quantity);
  const dateIso = toIsoFromDateInput(draft.dateIso);
  const quantityChanged = !Number.isNaN(quantity) && quantity !== operation.quantity;
  const dateChanged =
    Boolean(dateIso && dateIso !== operation.dateIso) || Boolean(operation.dateIso && !dateIso);
  const machineChanged = (draft.machineId || null) !== operation.machineId;
  const verifiedChanged = draft.isVerified !== operation.isVerified;
  const categoryChanged = draft.category !== operation.category;
  return quantityChanged || dateChanged || machineChanged || verifiedChanged || categoryChanged;
}

export function mapJobGroups(responseData: unknown, companyId: string): JobGroupRow[] {
  const groups = extractArray(responseData, 'groups');
  return groups
    .map((group) => {
      const company = asRecord(group.company);
      const createdAtRaw =
        group.createdAt != null && String(group.createdAt).trim().length > 0
          ? String(group.createdAt)
          : '';
      return {
        id: toStringValue(group.jobId, ''),
        jobId: toStringValue(group.jobId),
        companyId: toStringValue(company?.id ?? group.companyId, ''),
        companyName: toStringValue(company?.name ?? group.companyName),
        createdAt: formatDateForView(createdAtRaw || null),
        createdAtRaw,
        totalOperations: Number(group.totalOperations ?? 0),
        verifiedOperations: Number(group.verifiedOperations ?? 0),
        pendingOperations: Number(group.pendingOperations ?? 0),
      } satisfies JobGroupRow;
    })
    .filter((group) => group.id.length > 0 && group.companyId === companyId)
    .sort((left, right) => {
      const leftTime = Date.parse(left.createdAtRaw);
      const rightTime = Date.parse(right.createdAtRaw);
      if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) return 0;
      return rightTime - leftTime;
    });
}

function getPrimaryProductName(jobItem: Record<string, unknown>): string {
  const products = Array.isArray(jobItem.products) ? jobItem.products : [];
  if (products.length === 0) return '-';
  const firstProduct = asRecord(products[0]);
  return toStringValue(firstProduct?.name);
}

export function mapJobOperations(responseData: unknown): JobOperationRow[] {
  const jobs = extractArray(responseData, 'jobs');
  return jobs.map((jobItem) => {
    const wrappedJob = asRecord(jobItem.job);
    const job = wrappedJob ?? jobItem;
    const productionUnit = asRecord(jobItem.productionUnit);
    const machine = asRecord(jobItem.machine);
    const dateIso = (job.dateOfOpeation ?? job.dateOfOperation ?? null) as string | null;
    return {
      id: toStringValue(job.id, ''),
      jobId: toStringValue(job.jobId, '-'),
      dateIso,
      category: toStringValue(job.category),
      productName: getPrimaryProductName(jobItem),
      productionUnitName: toStringValue(productionUnit?.name),
      productionUnitId: toStringValue(job.productionUnitId, ''),
      quantity: toNumberValue(job.quantity),
      unitOfMeasureQuantity: toStringValue(job.unitOfMeasureQuantity, ''),
      machineId: machine?.id ? String(machine.id) : null,
      machineName: machine?.name ? String(machine.name) : null,
      isVerified: Boolean(job.isVerified),
      conformityChecked: Boolean(job.conformityChecked),
      note: job.note ? String(job.note) : null,
      alertNotes: job.alertNotes,
      history: job.history,
      raw: jobItem,
    } satisfies JobOperationRow;
  });
}

