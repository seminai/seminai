import type { ColumnDef } from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { DataTableTruncatedValue } from "@/components/organisms/data-table";
import { toDateInputValue } from "./mappers";
import type {
  JobOperationsColumnsParams,
  JobOperationsTableRow,
} from "./jobs-operations-table-types";
import {
  buildDisplayQuantityFromOperation,
  JobOperationStatusDot,
  MachineInput,
} from "./jobs-operations-table-cells";
import { getUnitSuffix } from "./jobs-operations-table-config";

export function createJobOperationsColumns({
  machineOptions,
  onSelectOperation,
  onDraftChange,
  onRemoveDraft,
}: JobOperationsColumnsParams): ColumnDef<JobOperationsTableRow, unknown>[] {
  return [
    {
      id: "stato",
      accessorKey: "statoLabel",
      header: "Stato",
      meta: { widthPercent: 8 },
      cell: ({ row }) => <JobOperationStatusDot row={row.original} />,
      filterFn: "multiValue" as never,
    },
    {
      id: "data",
      accessorKey: "dataLabel",
      header: "Data",
      meta: { widthPercent: 12 },
      sortingFn: (rowA, rowB) => {
        const a = rowA.original.dataSortKey || "";
        const b = rowB.original.dataSortKey || "";
        return String(a).localeCompare(String(b));
      },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          return (
            <Input
              type="date"
              value={r.draft.dateIso}
              onChange={(event) =>
                onDraftChange(r.draft!.id, "dateIso", event.target.value)
              }
              onClick={(event) => event.stopPropagation()}
            />
          );
        }
        if (r.kind === "operation" && r.operation) {
          const op = r.operation;
          const draft = r.draft ?? undefined;
          const dateValue = draft
            ? draft.dateIso
            : toDateInputValue(op.dateIso);
          return (
            <Input
              type="date"
              value={dateValue}
              onChange={(event) =>
                onDraftChange(op.id, "dateIso", event.target.value)
              }
              onClick={(event) => event.stopPropagation()}
            />
          );
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
    {
      id: "verifica",
      accessorKey: "verificaLabel",
      header: "Verifica",
      meta: { widthPercent: 9 },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          return (
            <Checkbox
              checked={r.draft.isVerified}
              onCheckedChange={(checked) =>
                onDraftChange(r.draft!.id, "isVerified", Boolean(checked))
              }
              onClick={(event) => event.stopPropagation()}
            />
          );
        }
        if (r.kind === "operation" && r.operation) {
          const op = r.operation;
          const draft = r.draft ?? undefined;
          const isVerified = draft ? draft.isVerified : op.isVerified;
          return (
            <Checkbox
              checked={isVerified}
              onCheckedChange={(checked) => {
                const nextChecked = Boolean(checked);
                onDraftChange(op.id, "isVerified", nextChecked);
                onSelectOperation(op.id, nextChecked);
              }}
              onClick={(event) => event.stopPropagation()}
            />
          );
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
    {
      id: "tipo",
      accessorKey: "tipoLabel",
      header: "Tipo",
      meta: { widthPercent: 11 },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          return (
            <Input
              value={r.draft.category}
              onChange={(event) =>
                onDraftChange(r.draft!.id, "category", event.target.value)
              }
              onClick={(event) => event.stopPropagation()}
            />
          );
        }
        if (r.kind === "operation" && r.operation) {
          return <DataTableTruncatedValue value={r.operation.category} />;
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
    {
      id: "prodotto",
      accessorKey: "prodottoLabel",
      header: "Prodotto",
      meta: { widthPercent: 21 },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          return (
            <div
              className="flex flex-col gap-1"
              onClick={(event) => event.stopPropagation()}
            >
              <span className="text-muted-foreground">Nuovo da template</span>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => onRemoveDraft(r.draft!.id)}
              >
                Rimuovi
              </Button>
            </div>
          );
        }
        if (r.kind === "operation" && r.operation) {
          return <DataTableTruncatedValue value={r.operation.productName} />;
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
    {
      id: "up",
      accessorKey: "upLabel",
      header: "UP",
      meta: { widthPercent: 15 },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          return (
            <span className="text-muted-foreground">
              {r.draft.productionUnitId || "-"}
            </span>
          );
        }
        if (r.kind === "operation" && r.operation) {
          return <DataTableTruncatedValue value={r.operation.productionUnitName} />;
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
    {
      id: "quantita",
      accessorKey: "quantitaLabel",
      header: "Quantità",
      meta: { widthPercent: 12 },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          const d = r.draft;
          const unit = getUnitSuffix(d.unitOfMeasureQuantity);
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                value={d.quantity}
                onChange={(event) =>
                  onDraftChange(d.id, "quantity", event.target.value)
                }
                onClick={(event) => event.stopPropagation()}
              />
              {unit ? (
                <span
                  className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums"
                  title="Unità di misura"
                >
                  {unit}
                </span>
              ) : null}
            </div>
          );
        }
        if (r.kind === "operation" && r.operation) {
          const op = r.operation;
          const draft = r.draft ?? undefined;
          const quantityValue = draft
            ? draft.quantity
            : String(op.quantity ?? "");
          const unit = getUnitSuffix(op.unitOfMeasureQuantity);
          return (
            <div className="flex min-w-0 items-center gap-2">
              <Input
                className="min-w-0 flex-1"
                value={quantityValue}
                onChange={(event) =>
                  onDraftChange(op.id, "quantity", event.target.value)
                }
                placeholder={buildDisplayQuantityFromOperation(r)}
                onClick={(event) => event.stopPropagation()}
              />
              {unit ? (
                <span
                  className="shrink-0 text-xs font-medium text-muted-foreground tabular-nums"
                  title="Unità di misura"
                >
                  {unit}
                </span>
              ) : null}
            </div>
          );
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
    {
      id: "macchina",
      accessorKey: "macchinaLabel",
      header: "Macchina",
      meta: { widthPercent: 12 },
      cell: ({ row }) => {
        const r = row.original;
        if (r.kind === "draft" && r.draft) {
          return (
            <MachineInput
              value={r.draft.machineId}
              options={machineOptions}
              onChange={(value) =>
                onDraftChange(r.draft!.id, "machineId", value)
              }
            />
          );
        }
        if (r.kind === "operation" && r.operation) {
          const op = r.operation;
          const draft = r.draft ?? undefined;
          const machineValue = draft ? draft.machineId : (op.machineId ?? "");
          return (
            <MachineInput
              value={machineValue}
              options={machineOptions}
              onChange={(value) => onDraftChange(op.id, "machineId", value)}
            />
          );
        }
        return null;
      },
      filterFn: "multiValue" as never,
    },
  ];
}
