import type {
  JobOperationsTableRow,
  MachineOption,
} from "./jobs-operations-table-types";
import { getVerificationStatusMeta } from "./job-verification-status";

export function buildDisplayQuantityFromOperation(
  row: JobOperationsTableRow,
): string {
  if (row.kind !== "operation" || !row.operation) return "-";
  const op = row.operation;
  if (op.quantity == null) return "-";
  const u = op.unitOfMeasureQuantity?.trim();
  return u ? `${op.quantity} ${u}` : String(op.quantity);
}

export function MachineInput({
  value,
  options,
  onChange,
}: {
  readonly value: string;
  readonly options: readonly MachineOption[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onClick={(event) => event.stopPropagation()}
      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="">Seleziona macchina</option>
      {options.map((option) => (
        <option key={option.id} value={option.id}>
          {option.name}
        </option>
      ))}
    </select>
  );
}

function StatusBadgeInner({
  meta,
}: {
  readonly meta: ReturnType<typeof getVerificationStatusMeta>;
}) {
  const toneClasses =
    meta.tone === "green"
      ? "bg-emerald-500 text-emerald-700"
      : meta.tone === "red"
        ? "bg-red-500 text-red-700"
        : "bg-amber-500 text-amber-700";

  return (
    <span
      title={meta.label}
      aria-label={meta.label}
      className={`inline-block h-2.5 w-2.5 rounded-full ${toneClasses}`}
    />
  );
}

export function JobOperationStatusDot({
  row,
}: {
  readonly row: JobOperationsTableRow;
}) {
  if (row.kind === "draft" && row.draft) {
    const meta = getVerificationStatusMeta({
      isVerified: row.draft.isVerified,
      conformityChecked: false,
    });
    return <StatusBadgeInner meta={meta} />;
  }
  if (row.kind === "operation" && row.operation) {
    const draft = row.draft ?? undefined;
    const isVerified = draft ? draft.isVerified : row.operation.isVerified;
    const meta = getVerificationStatusMeta({
      isVerified,
      conformityChecked: row.operation.conformityChecked,
    });
    return <StatusBadgeInner meta={meta} />;
  }
  return null;
}
