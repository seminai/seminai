import { useEffect, useMemo, useState } from "react";
import type {
  ColumnFiltersState,
  PaginationState,
  SortingState,
} from "@tanstack/react-table";
import { DataTableSwitch } from "@/components/organisms/data-table-switch";
import { SelectionActionBar } from "@/components/molecules/selection-action-bar";
import { PrintOperationsButton } from "@/components/molecules/print-operations-button";
import { exportCsv, exportExcel, exportPdf } from "@/lib/export";
import { buildTableExportParams } from "@/lib/table-export";
import { useExportFilename } from "@/hooks/use-export-filename";
import { buildJobOperationsPrintExportParams } from "./job-operations-print-export";
import { cn } from "@/lib/utils";
import { shouldIgnoreDataTableRowClick } from "@/lib/data-table-row-click";
import {
  buildJobOperationsTableRows,
  jobOperationsRowMatchesSearch,
} from "./jobs-operations-table-build-rows";
import { createJobOperationsColumns } from "./jobs-operations-table-columns";
import {
  isZeroQuantityRow,
  JOB_OPERATIONS_COLUMN_LABELS,
  JOB_OPERATIONS_EXPORT_COLUMNS,
} from "./jobs-operations-table-config";
import type {
  JobOperationsTableRow,
  JobsOperationsTableProps,
  MachineOption,
} from "./jobs-operations-table-types";
import {
  OperationsSelectionFooter,
  OperationsStatusHeader,
} from "./jobs-operations-table-chrome";

export type { MachineOption };

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
      <OperationsStatusHeader />
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
          <OperationsSelectionFooter
            selectedCount={selectedCount}
            hasUnsavedChanges={hasUnsavedChanges}
            isSaving={isSaving}
            onSave={onSave}
            onBulkVerifySelected={onBulkVerifySelected}
          />
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
