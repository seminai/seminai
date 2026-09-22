import { ResizablePanelLayout } from '@/components/molecules/resizable-panel-layout';
import { JobsGroupsList } from '@/components/organisms/jobs/jobs-groups-list';
import { JobsOperationsTable } from '@/components/organisms/jobs/jobs-operations-table';
import { JobsRightSidebar } from '@/components/organisms/jobs/jobs-right-sidebar';
import { useJobsMasterDetail } from '@/components/organisms/jobs/use-jobs-master-detail';
import { useIsMobile } from '@/hooks/use-mobile';

interface JobsMasterDetailProps {
  readonly companyId: string;
  readonly initialJobId?: string;
}

export function JobsMasterDetail({ companyId, initialJobId }: JobsMasterDetailProps) {
  const state = useJobsMasterDetail(companyId, initialJobId);
  const isMobile = useIsMobile();
  if (state.isLoadingGroups) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">Caricamento gruppi job...</div>;
  }
  if (state.groups.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Non ci sono dati</p>;
  }
  if (!state.selectedGroupJobId) {
    return (
      <JobsGroupsList
        groups={state.groups}
        selectedGroupId={null}
        onSelectGroup={(jobId) => state.setSelectedGroupJobId(jobId)}
      />
    );
  }

  const centerContent = (
    <JobsOperationsTable
      operations={state.operations}
      drafts={state.drafts}
      machineOptions={state.machineOptions}
      selectedOperationIds={state.selectedOperationIds}
      hasUnsavedChanges={state.hasUnsavedChanges}
      isSaving={state.isSaving}
      saveMessage={state.saveMessage}
      onSelectOperation={state.handleSelectOperation}
      onDraftChange={state.handleDraftChange}
      onRemoveDraft={state.handleRemoveDraft}
      onSave={state.handleSave}
      onBulkVerifySelected={state.handleBulkVerifySelected}
    />
  );

  const rightSidebarContent = (
    <JobsRightSidebar
      jobId={state.selectedGroupJobId}
      mode={state.rightSidebarMode}
      onModeChange={state.setRightSidebarMode}
      onCloseSidebar={() => state.setIsRightSidebarOpen(false)}
      onDeselectOperation={(operationId) => state.handleSelectOperation(operationId, false)}
      selectedJobs={state.selectedJobs}
      summary={state.selectedSummary}
      verificationSnapshot={state.verificationSnapshot}
      onConformityConfirmSuccess={state.refreshJobsData}
    />
  );

  if (!state.isRightSidebarOpen) {
    return <div className="flex h-full min-h-0 flex-col">{centerContent}</div>;
  }

  if (isMobile) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-[1.2]">{centerContent}</div>
        <div className="min-h-0 flex-1 border-t">{rightSidebarContent}</div>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ResizablePanelLayout
        defaultSizes={[100 - state.rightPanelWidth, state.rightPanelWidth]}
        onLayoutChange={(sizes) => {
          const nextRightSize = sizes[1] ?? state.rightPanelWidth;
          state.setRightPanelWidth(Math.max(25, Math.min(45, nextRightSize)));
        }}
        left={centerContent}
        right={rightSidebarContent}
      />
    </div>
  );
}
