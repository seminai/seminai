import { useEffect, useMemo, useState } from "react";
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { Button } from "@/components/ui/button";
import { DataTableSwitch } from "@/components/organisms/data-table-switch";
import { SelectionActionBar } from "@/components/molecules/selection-action-bar";
import { InfoTooltip } from "@/components/atoms/info-tooltip";
import { VerificationStatusLegend } from "@/components/molecules/verification-status-legend";
import { PrintOperationsButton } from "@/components/molecules/print-operations-button";
import { exportCsv, exportExcel, exportPdf } from "@/lib/export";
import { buildTableExportParams } from "@/lib/table-export";
import { useExportFilename } from "@/hooks/use-export-filename";
import { buildJobOperationsPrintExportParams } from "./job-operations-print-export";
import { cn } from "@/lib/utils";
import { formatDateForView } from "./mappers";
import type {
  JobDraftEditableField,
  JobOperationRow,
  JobRowDraft,
} from "./types";
import { shouldIgnoreDataTableRowClick } from "@/lib/data-table-row-click";
import {
  buildJobOperationsTableRows,
  jobOperationsRowMatchesSearch,
} from "./jobs-operations-table-build-rows";
import {
  createJobOperationsColumns,
  JOB_OPERATIONS_COLUMN_LABELS,
} from "./jobs-operations-table-columns";
import type {
  JobOperationsTableRow,
  MachineOption,
} from "./jobs-operations-table-types";

export type { MachineOption };

const JOB_OPERATIONS_EXPORT_COLUMNS = [
  { label: JOB_OPERATIONS_COLUMN_LABELS.stato, getValue: (row: JobOperationsTableRow) => row.statoLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.data, getValue: (row: JobOperationsTableRow) => row.dataLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.verifica, getValue: (row: JobOperationsTableRow) => row.verificaLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.tipo, getValue: (row: JobOperationsTableRow) => row.tipoLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.prodotto, getValue: (row: JobOperationsTableRow) => row.prodottoLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.up, getValue: (row: JobOperationsTableRow) => row.upLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.quantita, getValue: (row: JobOperationsTableRow) => row.quantitaLabel },
  { label: JOB_OPERATIONS_COLUMN_LABELS.macchina, getValue: (row: JobOperationsTableRow) => row.macchinaLabel },
] as const;

interface JobsOperationsTableProps {
  readonly operations: readonly JobOperationRow[];
  readonly drafts: Readonly<Record<string, JobRowDraft>>;
  readonly machineOptions: readonly MachineOption[];
  readonly selectedOperationIds: readonly string[];
  readonly hasUnsavedChanges: boolean;
  readonly isSaving: boolean;
  readonly saveMessage: string | null;
  readonly onSelectOperation: (operationId: string, checked: boolean) => void;
  readonly onDraftChange: (
    operationId: string,
    field: JobDraftEditableField,
    value: string | boolean,
  ) => void;
  readonly onRemoveDraft: (draftId: string) => void;
  readonly onSave: () => Promise<void>;
  readonly onBulkVerifySelected: () => Promise<void>;
}

/** Numeric quantity for sort / zero-row styling: draft parse wins when valid. */
function effectiveNumericQuantity(
  operation: JobOperationRow,
  draft: JobRowDraft | undefined,
): number | null {
  if (draft) {
    const parsed = Number.parseFloat(draft.quantity);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return operation.quantity;
}

function isZeroQuantityRow(
  operation: JobOperationRow,
  draft: JobRowDraft | undefined,
): boolean {
  return effectiveNumericQuantity(operation, draft) === 0;
}

export function JobsOperationsTable({
  operations,
  drafts,
  machineOptions,
  selectedOperationIds,
  hasUnsavedChanges,
  isSaving,
  saveMessage,
  onSelectOperation,
  onDraftChange,
  onRemoveDraft,
  onSave,
  onBulkVerifySelected,
}: JobsOperationsTableProps) {
  const selectedCount = selectedOperationIds.length;
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: 25,
  });
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const sortedOperations = useMemo(
    () =>
      [...operations]
        .map((operation, index) => ({ operation, index }))
        .sort((left, right) => {
          const zLeft = isZeroQuantityRow(
            left.operation,
            drafts[left.operation.id],
          )
            ? 1
            : 0;
          const zRight = isZeroQuantityRow(
            right.operation,
            drafts[right.operation.id],
          )
            ? 1
            : 0;
          if (zLeft !== zRight) return zLeft - zRight;
          return left.index - right.index;
        })
        .map(({ operation }) => operation),
    [operations, drafts],
  );

  const newDrafts = useMemo(
    () => Object.values(drafts).filter((draft) => draft.isNew),
    [drafts],
  );

  const tableRows = useMemo(
    () =>
      buildJobOperationsTableRows(
        sortedOperations,
        drafts,
        machineOptions,
        newDrafts,
      ),
    [sortedOperations, drafts, machineOptions, newDrafts],
  );

  const searchFilteredRows = useMemo(
    () =>
      tableRows.filter((row) =>
        jobOperationsRowMatchesSearch(row, debouncedSearch),
      ),
    [tableRows, debouncedSearch],
  );

  const columns = useMemo(
    () =>
      createJobOperationsColumns({
        machineOptions,
        onSelectOperation,
        onDraftChange,
        onRemoveDraft,
      }),
    [machineOptions, onSelectOperation, onDraftChange, onRemoveDraft],
  );

  const selectedRows = useMemo(
    () =>
      searchFilteredRows.filter(
        (row) =>
          row.kind === "operation" &&
          row.operation &&
          selectedOperationIds.includes(row.operation.id),
      ),
    [searchFilteredRows, selectedOperationIds],
  );

  const exportFilename = useExportFilename({ section: "operazioni" });

  const printableRows = useMemo(
    () => searchFilteredRows.filter((row) => row.kind === "operation"),
    [searchFilteredRows],
  );

  const getSelectionExportData = useMemo(
    () =>
      buildTableExportParams({
        columns: JOB_OPERATIONS_EXPORT_COLUMNS,
        rows: selectedRows,
        filename: exportFilename,
      }),
    [selectedRows, exportFilename],
  );

  const getPrintExportData = useMemo(
    () =>
      buildJobOperationsPrintExportParams({
        tableRows: printableRows,
        drafts,
        filename: exportFilename,
      }),
    [printableRows, drafts, exportFilename],
  );

  const selectionExportOptions = useMemo(
    () => [
      { label: "CSV", format: "csv" as const, onClick: () => exportCsv(getSelectionExportData) },
      { label: "Excel (.xls)", format: "excel" as const, onClick: () => exportExcel(getSelectionExportData) },
      { label: "PDF (stampa)", format: "pdf" as const, onClick: () => exportPdf(getSelectionExportData) },
    ],
    [getSelectionExportData],
  );

  const printExportOptions = useMemo(
    () => [
      { label: "CSV", format: "csv" as const, onClick: () => exportCsv(getPrintExportData) },
      { label: "Excel (.xls)", format: "excel" as const, onClick: () => exportExcel(getPrintExportData) },
      { label: "PDF (stampa)", format: "pdf" as const, onClick: () => exportPdf(getPrintExportData) },
    ],
    [getPrintExportData],
  );

  const handleDeselect = () => {
    for (const operationId of selectedOperationIds) {
      onSelectOperation(operationId, false);
    }
  };

  const handleClearFilters = () => {
    setColumnFilters([]);
    setSorting([]);
    setSearchInput("");
    setDebouncedSearch("");
    setPagination((previous) => ({ ...previous, pageIndex: 0 }));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[0.7rem] text-muted-foreground sm:px-4 sm:text-xs">
        <span>Stato verifica</span>
        <InfoTooltip title="Legenda stato verifica">
          <VerificationStatusLegend />
        </InfoTooltip>
      </div>
      {saveMessage ? (
        <div className="border-b px-3 py-2 text-[0.7rem] text-muted-foreground sm:px-4 sm:text-xs">
          {saveMessage}
        </div>
      ) : null}
      <DataTableSwitch<JobOperationsTableRow>
        data={searchFilteredRows}
        columns={columns}
        columnLabels={JOB_OPERATIONS_COLUMN_LABELS}
        bulkActions={[]}
        exportSection="operazioni"
        showSelectionColumn={false}
        columnWidthMode="percent"
        tableClassName="w-full min-w-[1120px] border-separate border-spacing-0 [&_td]:leading-tight [&_th]:leading-tight"
        totalCount={searchFilteredRows.length}
        toolbarRightSlot={
          <PrintOperationsButton
            count={printableRows.length}
            exportOptions={printExportOptions}
          />
        }
        searchValue={searchInput}
        onSearchValueChange={setSearchInput}
        searchPlaceholder="Cerca operazioni..."
        columnFilters={columnFilters}
        onColumnFiltersChange={setColumnFilters}
        sorting={sorting}
        onSortingChange={setSorting}
        onClearFilters={handleClearFilters}
        pagination={pagination}
        onPaginationChange={setPagination}
        manualPagination={false}
        manualSorting={false}
        manualFiltering={false}
        getRowId={(row) => row.rowId}
        getRowClassName={(row) => {
          if (row.kind === "draft") return "border-t bg-muted/30";
          if (!row.operation) return undefined;
          const op = row.operation;
          const draft = row.draft ?? drafts[op.id];
          const isZeroQty = isZeroQuantityRow(op, draft);
          const isSelected = selectedOperationIds.includes(op.id);
          return cn(
            "border-t hover:bg-muted/40",
            isZeroQty &&
              "bg-muted/50 text-muted-foreground [&_button]:text-muted-foreground [&_input]:border-muted-foreground/25 [&_input]:bg-muted/40 [&_input]:text-muted-foreground [&_select]:border-muted-foreground/25 [&_select]:bg-muted/40 [&_select]:text-muted-foreground",
            isSelected && "bg-muted/70",
            isSelected && isZeroQty && "bg-muted/45",
          );
        }}
        getCellClassName={(row, { isFirstVisibleCell, isLastVisibleCell }) => {
          if (row.kind !== "operation" || !row.operation) return undefined;
          if (
            !selectedOperationIds.includes(row.operation.id) ||
            !isFirstVisibleCell ||
            isLastVisibleCell
          )
            return undefined;
          const draft = row.draft ?? drafts[row.operation.id];
          const isZeroQty = isZeroQuantityRow(row.operation, draft);
          return isZeroQty ? "bg-muted/50" : "bg-muted/45";
        }}
        onRowClick={(row, event) => {
          if (shouldIgnoreDataTableRowClick(event.target)) return;
          if (row.kind === "operation" && row.operation) {
            const id = row.operation.id;
            const isSelected = selectedOperationIds.includes(id);
            onSelectOperation(id, !isSelected);
          }
        }}
        secondaryFooter={
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[0.7rem] text-muted-foreground sm:text-xs">
              Selezionate: {selectedCount} — Ultimo aggiornamento tabella:{" "}
              {formatDateForView(new Date().toISOString())}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {selectedCount > 1 ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onBulkVerifySelected}
                  disabled={isSaving}
                >
                  Verifica selezionate
                </Button>
              ) : null}
              {hasUnsavedChanges ? (
                <Button size="sm" onClick={onSave} disabled={isSaving}>
                  Salva
                </Button>
              ) : null}
            </div>
          </div>
        }
      />
      <SelectionActionBar
        selectedCount={selectedRows.length}
        actions={[]}
        exportOptions={selectionExportOptions}
        onDeselect={handleDeselect}
        selectedLabel={`${selectedRows.length} operazion${selectedRows.length === 1 ? "e" : "i"} selezionat${selectedRows.length === 1 ? "a" : "e"}`}
      />
    </div>
  );
}
