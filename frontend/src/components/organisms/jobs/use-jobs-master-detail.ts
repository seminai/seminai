import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetJobsGroupJobIdQueryKey,
  getGetJobsGroupsSummaryQueryKey,
  getJobsCreateProductAndJobStatusJobId,
  useGetJobsGroupJobId,
  useGetJobsGroupsSummary,
  usePostJobsCreateProductAndJob,
  usePutJobsId,
} from '@/generated/api/jobs/jobs';
import { useGetMachinesCompanyCompanyId } from '@/generated/api/machines/machines';
import { extractArray } from '@/lib/api-response';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import { useProcess } from '@/hooks/use-process-registry';
import {
  buildConformityProcessKey,
  processStateToVerificationSnapshot,
} from '@/hooks/use-conformity-process';
import {
  jobOperationDraftHasPendingChanges,
  mapJobGroups,
  mapJobOperations,
  toDateInputValue,
  toIsoFromDateInput,
} from './mappers';
import type {
  JobDraftEditableField,
  JobOperationRow,
  JobRowDraft,
  RightSidebarMode,
  VerificationSnapshot,
} from './types';

interface JobsMasterDetailState {
  readonly groups: ReturnType<typeof mapJobGroups>;
  readonly operations: readonly JobOperationRow[];
  readonly selectedGroupJobId: string | null;
  readonly selectedOperationIds: readonly string[];
  readonly rightSidebarMode: RightSidebarMode;
  readonly isRightSidebarOpen: boolean;
  readonly rightPanelWidth: number;
  readonly drafts: Readonly<Record<string, JobRowDraft>>;
  readonly hasUnsavedChanges: boolean;
  readonly isSaving: boolean;
  readonly saveMessage: string | null;
  readonly verificationSnapshot: VerificationSnapshot | null;
  readonly selectedJobs: readonly JobOperationRow[];
  readonly selectedSummary: ReturnType<typeof mapJobGroups>[number] | null;
  readonly machineOptions: ReadonlyArray<{ readonly id: string; readonly name: string }>;
  readonly isLoadingGroups: boolean;
  setSelectedGroupJobId: (value: string | null) => void;
  setRightSidebarMode: (mode: RightSidebarMode) => void;
  setIsRightSidebarOpen: (isOpen: boolean) => void;
  setRightPanelWidth: (value: number) => void;
  handleSelectOperation: (operationId: string, checked: boolean) => void;
  handleToggleSelectAll: (checked: boolean) => void;
  handleDraftChange: (operationId: string, field: JobDraftEditableField, value: string | boolean) => void;
  handleRemoveDraft: (draftId: string) => void;
  handleSave: () => Promise<void>;
  handleBulkVerifySelected: () => Promise<void>;
  refreshJobsData: () => Promise<void>;
}

export function useJobsMasterDetail(companyId: string, initialJobId?: string): JobsMasterDetailState {
  const queryClient = useQueryClient();
  const [selectedGroupJobId, setSelectedGroupJobId] = useState<string | null>(initialJobId ?? null);
  const [selectedOperationIds, setSelectedOperationIds] = useState<readonly string[]>([]);
  const [rightSidebarMode, setRightSidebarMode] = useState<RightSidebarMode>('details');
  const [isRightSidebarOpen, setIsRightSidebarOpen] = useState(true);
  const [rightPanelWidth, setRightPanelWidth] = useState(34);
  const [drafts, setDrafts] = useState<Readonly<Record<string, JobRowDraft>>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const conformityProcessKey = selectedGroupJobId
    ? buildConformityProcessKey(selectedGroupJobId)
    : null;
  const conformityProcess = useProcess(conformityProcessKey);
  const verificationSnapshot = useMemo<VerificationSnapshot | null>(
    () => processStateToVerificationSnapshot(conformityProcess),
    [conformityProcess],
  );

  const groupsQuery = useGetJobsGroupsSummary();
  const groupJobsQuery = useGetJobsGroupJobId(selectedGroupJobId ?? '', { query: { enabled: Boolean(selectedGroupJobId) } });
  const machinesQuery = useGetMachinesCompanyCompanyId(companyId);
  const updateMutation = usePutJobsId();
  const createMutation = usePostJobsCreateProductAndJob();

  const groups = useMemo(() => mapJobGroups(groupsQuery.data?.data, companyId), [groupsQuery.data, companyId]);
  const operations = useMemo(() => mapJobOperations(groupJobsQuery.data?.data), [groupJobsQuery.data]);
  const selectedSummary = useMemo(
    () => groups.find((group) => group.jobId === selectedGroupJobId) ?? null,
    [groups, selectedGroupJobId],
  );
  const selectedJobs = useMemo(
    () => operations.filter((operation) => selectedOperationIds.includes(operation.id)),
    [operations, selectedOperationIds],
  );
  const hasUnsavedChanges = useMemo(() => {
    for (const draft of Object.values(drafts)) {
      if (draft.isNew) return true;
      const operation = operations.find((op) => op.id === draft.id);
      if (jobOperationDraftHasPendingChanges(draft, operation)) return true;
    }
    return false;
  }, [drafts, operations]);
  const machineOptions = useMemo(() => {
    const machineItems = extractArray(machinesQuery.data?.data, 'machines');
    return machineItems
      .map((machine) => {
        const id = String(machine.id ?? '');
        const rawName = String(machine.name ?? machine.identifier ?? '').trim();
        return { id, name: rawName.length > 0 ? rawName : 'Macchina senza nome' };
      })
      .filter((machine) => machine.id.length > 0);
  }, [machinesQuery.data]);

  useEffect(() => {
    if (!initialJobId) return;
    if (groups.some((group) => group.jobId === initialJobId)) {
      setSelectedGroupJobId(initialJobId);
      setIsRightSidebarOpen(true);
    }
  }, [groups, initialJobId]);

  useEffect(() => {
    setSelectedOperationIds((previous) => previous.filter((id) => operations.some((operation) => operation.id === id)));
  }, [operations]);

  function buildDraftFromOperation(operation: JobOperationRow, id = operation.id, isNew = false): JobRowDraft {
    return {
      id,
      isNew,
      sourceOperationId: isNew ? operation.id : undefined,
      dateIso: toDateInputValue(operation.dateIso),
      quantity: operation.quantity != null ? String(operation.quantity) : '',
      machineId: operation.machineId ?? '',
      isVerified: operation.isVerified,
      category: operation.category,
      unitOfMeasureQuantity: operation.unitOfMeasureQuantity,
      productionUnitId: operation.productionUnitId,
    };
  }

  function handleDraftChange(operationId: string, field: JobDraftEditableField, value: string | boolean): void {
    setDrafts((previous) => {
      const existing = previous[operationId];
      const operation = operations.find((current) => current.id === operationId);
      const base = existing ?? (operation ? buildDraftFromOperation(operation) : undefined);
      if (!base) return previous;
      return { ...previous, [operationId]: { ...base, [field]: value } };
    });
  }

  function handleSelectOperation(operationId: string, checked: boolean): void {
    setSelectedOperationIds((previous) => {
      if (checked) return Array.from(new Set([...previous, operationId]));
      return previous.filter((value) => value !== operationId);
    });
    setIsRightSidebarOpen(true);
  }

  function handleToggleSelectAll(checked: boolean): void {
    setSelectedOperationIds(checked ? operations.map((operation) => operation.id) : []);
  }

  function handleRemoveDraft(draftId: string): void {
    setDrafts((previous) => {
      const next = { ...previous };
      delete next[draftId];
      return next;
    });
  }

  async function refreshJobsData(): Promise<void> {
    await queryClient.invalidateQueries({ queryKey: getGetJobsGroupsSummaryQueryKey() });
    if (selectedGroupJobId) await queryClient.invalidateQueries({ queryKey: getGetJobsGroupJobIdQueryKey(selectedGroupJobId) });
  }

  async function waitForAsyncCreation(statusJobId: string): Promise<void> {
    for (let attempts = 0; attempts < 8; attempts += 1) {
      const statusResponse = await getJobsCreateProductAndJobStatusJobId(statusJobId);
      const statusBody = ((statusResponse as { data?: Record<string, unknown> }).data ??
        {}) as Record<string, unknown>;
      const statusData = (statusBody.data as Record<string, unknown> | undefined) ?? {};
      const state = String(statusData.state ?? '').toLowerCase();
      if (state === 'completed' || state === 'failed' || Boolean(statusData.stopPolling)) return;
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
    }
  }

  async function handleSave(): Promise<void> {
    setIsSaving(true);
    setSaveMessage('Salvataggio in corso...');
    try {
      for (const draft of Object.values(drafts).filter((item) => !item.isNew)) {
        const operation = operations.find((item) => item.id === draft.id);
        if (!operation) continue;
        const payload: Record<string, unknown> = {};
        const quantity = Number.parseFloat(draft.quantity);
        const dateIso = toIsoFromDateInput(draft.dateIso);
        if (!Number.isNaN(quantity) && quantity !== operation.quantity) payload.quantity = quantity;
        if (dateIso && dateIso !== operation.dateIso) payload.dateOfOpeation = dateIso;
        if ((draft.machineId || null) !== operation.machineId) payload.machineId = draft.machineId || null;
        if (draft.isVerified !== operation.isVerified) payload.isVerified = draft.isVerified;
        if (draft.category !== operation.category) payload.category = draft.category;
        if (Object.keys(payload).length === 0) continue;
        payload.conformityChecked = false;
        await updateMutation.mutateAsync({ id: operation.id, data: payload });
      }
      const newDrafts = Object.values(drafts).filter((item) => item.isNew);
      if (newDrafts.length > 0 && selectedGroupJobId) {
        const createPayload = newDrafts.map((draft) => {
          const source = operations.find((operation) => operation.id === draft.sourceOperationId);
          const quantity = Number.parseFloat(draft.quantity);
          return {
            jobId: selectedGroupJobId,
            productionUnitId: draft.productionUnitId || source?.productionUnitId,
            dateOfOpeation: toIsoFromDateInput(draft.dateIso) ?? source?.dateIso,
            quantity: Number.isNaN(quantity) ? source?.quantity ?? 0 : quantity,
            unitOfMeasureQuantity: draft.unitOfMeasureQuantity || source?.unitOfMeasureQuantity || 'L',
            category: draft.category || source?.category || 'TREATMENT',
            machineId: draft.machineId || null,
            isVerified: draft.isVerified,
            conformityChecked: false,
            productName: source?.productName ?? 'Unknown',
          };
        });
        const createResponse = await createMutation.mutateAsync({ data: createPayload });
        const statusJobId = ((createResponse.data as Record<string, unknown>)?.data as Record<string, unknown> | undefined)?.jobId;
        if (
          (createResponse as { status?: number }).status === 202 &&
          typeof statusJobId === 'string'
        )
          await waitForAsyncCreation(statusJobId);
      }
      setDrafts({});
      await refreshJobsData();
      setSaveMessage('Salvataggio completato.');
    } catch (error) {
      const fallbackMessage = 'Errore durante il salvataggio.';
      setSaveMessage(error instanceof Error ? sanitizeUserFacingText(error.message) : fallbackMessage);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleBulkVerifySelected(): Promise<void> {
    if (selectedOperationIds.length === 0) return;
    setIsSaving(true);
    setSaveMessage('Verifica in corso...');
    try {
      for (const operationId of selectedOperationIds) {
        await updateMutation.mutateAsync({ id: operationId, data: { isVerified: true, conformityChecked: false } });
      }
      await refreshJobsData();
      setSaveMessage('Verifica completata.');
    } finally {
      setIsSaving(false);
    }
  }

  return {
    groups,
    operations,
    selectedGroupJobId,
    selectedOperationIds,
    rightSidebarMode,
    isRightSidebarOpen,
    rightPanelWidth,
    drafts,
    hasUnsavedChanges,
    isSaving,
    saveMessage,
    verificationSnapshot,
    selectedJobs,
    selectedSummary,
    machineOptions,
    isLoadingGroups: groupsQuery.isLoading,
    setSelectedGroupJobId,
    setRightSidebarMode,
    setIsRightSidebarOpen,
    setRightPanelWidth,
    handleSelectOperation,
    handleToggleSelectAll,
    handleDraftChange,
    handleRemoveDraft,
    handleSave,
    handleBulkVerifySelected,
    refreshJobsData,
  };
}
