import { useMemo, useState } from "react";
import { PanelRightClose, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCompanyWithJobGroupCode } from "@/lib/job-group-format";
import { JobVerificationAgentChatPanel } from "./job-verification-agent-chat-panel";
import { mapHistoryEntriesItalian } from "./format-job-history";
import { JobOperationDetailCard } from "./job-operation-detail-card";
import { JobSingleOperationCreateDialog } from "./job-single-operation-create-dialog";
import type {
  JobGroupRow,
  JobOperationRow,
  RightSidebarMode,
  VerificationSnapshot,
} from "./types";

interface JobsRightSidebarProps {
  readonly jobId: string | null;
  readonly mode: RightSidebarMode;
  readonly onModeChange: (mode: RightSidebarMode) => void;
  readonly onCloseSidebar: () => void;
  readonly onDeselectOperation: (operationId: string) => void;
  readonly selectedJobs: readonly JobOperationRow[];
  readonly summary: JobGroupRow | null;
  readonly verificationSnapshot: VerificationSnapshot | null;
  readonly onConformityConfirmSuccess: () => Promise<void> | void;
}

function SidebarModeButton({
  label,
  isActive,
  onClick,
}: {
  readonly label: string;
  readonly isActive: boolean;
  readonly onClick: () => void;
}) {
  return (
    <Button
      size="sm"
      variant="ghost"
      className={
        isActive
          ? "bg-muted font-semibold text-foreground"
          : "text-muted-foreground"
      }
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

function JobSelectedDetails({
  jobId,
  selectedJobs,
  summary,
  onDeselectOperation,
  onCreateSuccess,
}: {
  readonly jobId: string | null;
  readonly selectedJobs: readonly JobOperationRow[];
  readonly summary: JobGroupRow | null;
  readonly onDeselectOperation: (operationId: string) => void;
  readonly onCreateSuccess: () => Promise<void> | void;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createButton = (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm font-semibold">Operazioni</span>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setIsCreateOpen(true)}
        disabled={!jobId || !summary?.companyId}
      >
        <Plus className="mr-1.5 h-4 w-4" />
        Nuova
      </Button>
      <JobSingleOperationCreateDialog
        open={isCreateOpen}
        groupJobId={jobId}
        defaultCompanyId={summary?.companyId ?? null}
        onOpenChange={setIsCreateOpen}
        onCreated={onCreateSuccess}
      />
    </div>
  );
  if (selectedJobs.length === 0) {
    return (
      <div className="space-y-3">
        {createButton}
        <p className="text-sm text-muted-foreground">
          Seleziona una o più operazioni per vedere i dettagli.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {createButton}
      {summary ? (
        <Card size="sm">
          <CardContent className="space-y-1 text-sm">
            <div>
              <span className="font-medium">Azienda:</span>{" "}
              {formatCompanyWithJobGroupCode(
                summary.companyName,
                summary.jobId,
              )}
            </div>
            <div>
              <span className="font-medium">Operazioni totali:</span>{" "}
              {summary.totalOperations}
            </div>
            <div>
              <span className="font-medium">Selezionate:</span>{" "}
              {selectedJobs.length}
            </div>
          </CardContent>
        </Card>
      ) : null}
      {selectedJobs.map((operation) => (
        <JobOperationDetailCard
          key={operation.id}
          operation={operation}
          onDeselect={onDeselectOperation}
        />
      ))}
    </div>
  );
}

function HistoryPanel({
  selectedJobs,
}: {
  readonly selectedJobs: readonly JobOperationRow[];
}) {
  const entries = useMemo(
    () => mapHistoryEntriesItalian(selectedJobs),
    [selectedJobs],
  );
  if (entries.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        Nessuno storico disponibile.
      </p>
    );
  return (
    <div className="space-y-2">
      {entries.map((entry) => (
        <Card key={entry.key} size="sm">
          <CardContent className="whitespace-pre-wrap wrap-break-word text-sm">
            {entry.text}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function JobsRightSidebar({
  jobId,
  mode,
  onModeChange,
  onCloseSidebar,
  onDeselectOperation,
  selectedJobs,
  summary,
  verificationSnapshot,
  onConformityConfirmSuccess,
}: JobsRightSidebarProps) {
  return (
    <div className="flex h-full flex-col border-l bg-background">
      <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onCloseSidebar}
          title="Chiudi sidebar"
          aria-label="Chiudi sidebar"
          className="shrink-0"
        >
          <PanelRightClose />
        </Button>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-1 rounded-md bg-muted/60 p-1">
          <SidebarModeButton
            label="Dettagli"
            isActive={mode === "details"}
            onClick={() => onModeChange("details")}
          />
          <SidebarModeButton
            label="Storico"
            isActive={mode === "history"}
            onClick={() => onModeChange("history")}
          />
          <SidebarModeButton
            label="Verifica"
            isActive={mode === "verification"}
            onClick={() => onModeChange("verification")}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-4">
        {mode === "details" ? (
          <JobSelectedDetails
            jobId={jobId}
            selectedJobs={selectedJobs}
            summary={summary}
            onDeselectOperation={onDeselectOperation}
            onCreateSuccess={onConformityConfirmSuccess}
          />
        ) : null}
        {mode === "history" ? (
          <HistoryPanel selectedJobs={selectedJobs} />
        ) : null}
        {mode === "verification" ? (
          <JobVerificationAgentChatPanel
            jobId={jobId}
            selectedJobs={selectedJobs}
            verificationSnapshot={verificationSnapshot}
            onConformityConfirmSuccess={onConformityConfirmSuccess}
          />
        ) : null}
      </div>
    </div>
  );
}
