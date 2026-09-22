import { useState, useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Plus, FileImage, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/molecules/searchable-select';
import { ManualPlanRow } from '@/components/molecules/manual-plan-row';
import { BrogliaccioImportDialog } from '@/components/molecules/brogliaccio-import-dialog';
import { usePostJobsCreateProductAndJob } from '@/generated/api/jobs/jobs';
import { useGetJobsGroupsSummary } from '@/generated/api/jobs/jobs';
import { useGetMachinesCompanyCompanyId } from '@/generated/api/machines/machines';
import { useGetUserOnCompanyCompanyCompanyId } from '@/generated/api/user-on-company/user-on-company';
import { useTabs } from '@/hooks/use-tabs';
import { extractArray } from '@/lib/api-response';
import { toNonEmptyString } from '@/lib/string';
import type { usePlanningState } from '@/hooks/use-planning-state';
import type { ManualPlanRow as ManualPlanRowType } from '@/types/planning';

interface ManualPlanningFormProps {
  readonly planning: ReturnType<typeof usePlanningState>;
}

interface SelectOption {
  readonly value: string;
  readonly label: string;
}

export function ManualPlanningForm({ planning }: ManualPlanningFormProps) {
  const { state } = planning;
  const navigate = useNavigate();
  const { removeTab } = useTabs();
  const [brogliaccioOpen, setBrogliaccioOpen] = useState(false);
  const [selectedMachineId, setSelectedMachineId] = useState('');
  const [selectedOperatorId, setSelectedOperatorId] = useState('');
  const createJob = usePostJobsCreateProductAndJob();
  const jobGroups = useGetJobsGroupsSummary();
  const machines = useGetMachinesCompanyCompanyId(state.companyId ?? '', {
    query: { enabled: Boolean(state.companyId) },
  });
  const operators = useGetUserOnCompanyCompanyCompanyId(state.companyId ?? '', {
    query: { enabled: Boolean(state.companyId) },
  });

  const jobGroupOptions = useMemo(() => {
    return extractArray(jobGroups.data?.data, 'groups')
      .map((group): SelectOption | null => {
        const jobId = toNonEmptyString(group.jobId);
        if (!jobId) return null;
        const company = group.company as Record<string, unknown> | undefined;
        const companyName = toNonEmptyString(company?.name ?? group.companyName);
        return {
          value: jobId,
          label: companyName ? `${companyName} - ${jobId}` : jobId,
        };
      })
      .filter((option): option is SelectOption => option !== null);
  }, [jobGroups.data]);

  const machineOptions = useMemo(() => {
    return extractArray(machines.data?.data, 'machines')
      .map((machine): SelectOption | null => {
        const id = toNonEmptyString(machine.id);
        if (!id) return null;
        const name = toNonEmptyString(machine.name);
        return {
          value: id,
          label: name || id,
        };
      })
      .filter((option): option is SelectOption => option !== null);
  }, [machines.data]);

  const operatorOptions = useMemo(() => {
    return extractArray(operators.data?.data, 'users', 'usersOnCompany')
      .map((operator): SelectOption | null => {
        const user = operator.user as Record<string, unknown> | undefined;
        const id = toNonEmptyString(user?.id ?? operator.userId);
        if (!id) return null;
        const name = toNonEmptyString(user?.name);
        const email = toNonEmptyString(user?.email);
        return {
          value: id,
          label: name || email || id,
        };
      })
      .filter((option): option is SelectOption => option !== null);
  }, [operators.data]);

  const puOptions = useMemo(
    () =>
      state.productionUnitOptions.filter((option) =>
        state.productionUnitIds.includes(option.id),
      ),
    [state.productionUnitIds, state.productionUnitOptions],
  );

  function addEmptyRow() {
    const row: ManualPlanRowType = {
      id: `row-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      productName: '',
      registrationNumber: '',
      quantity: 0,
      quantityUnitOfMeasure: 'L',
      date: '',
    };
    planning.addManualRows([row]);
  }

  async function handleSubmit() {
    if (state.manualRows.length === 0) return;

    const payload = state.manualRows.flatMap((row) => {
      const unitIds =
        row.productionUnitId ? [row.productionUnitId] : state.productionUnitIds;
      return unitIds.map((puId) => ({
        productName: row.productName,
        registrationNumber: row.registrationNumber,
        quantity: row.quantity,
        quantityUnitOfMeasure: row.quantityUnitOfMeasure,
        date: row.date,
        productionUnitId: puId,
        category: row.category,
        companyId: state.companyId,
        machineId: selectedMachineId || undefined,
        operatorUserId: selectedOperatorId || undefined,
        ...(state.operationCode ? { jobId: state.operationCode } : {}),
      }));
    });

    await createJob.mutateAsync({ data: payload });
    removeTab('add-data');
    void navigate({ to: '/' });
  }

  return (
    <div className="flex flex-col gap-6 px-6 py-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Operazioni</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setBrogliaccioOpen(true)}>
            <FileImage className="mr-1.5 h-4 w-4" />
            Importa brogliaccio
          </Button>
          <Button variant="outline" size="sm" onClick={addEmptyRow}>
            <Plus className="mr-1.5 h-4 w-4" />
            Aggiungi riga
          </Button>
        </div>
      </div>

      {state.manualRows.length === 0 ? (
        <p className="text-center text-sm text-muted-foreground">
          Nessuna operazione. Aggiungi una riga o importa un brogliaccio.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {state.manualRows.map((row) => (
            <ManualPlanRow
              key={row.id}
              row={row}
              productionUnitOptions={puOptions}
              onUpdate={(updates) => planning.updateManualRow(row.id, updates)}
              onRemove={() => planning.removeManualRow(row.id)}
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Codice operazione (opzionale)
          </label>
          <SearchableSelect
            value={state.operationCode ?? ''}
            options={jobGroupOptions}
            placeholder="Usa esistente..."
            searchPlaceholder="Cerca operazione..."
            emptyMessage="Nessuna operazione."
            onChange={(v) => planning.setOperationCode(v || null)}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Macchinario (opzionale)
          </label>
          <SearchableSelect
            value={selectedMachineId}
            options={machineOptions}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca macchinario..."
            emptyMessage="Nessun macchinario."
            onChange={(v) => setSelectedMachineId(v ?? '')}
          />
        </div>
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Operatore (opzionale)
          </label>
          <SearchableSelect
            value={selectedOperatorId}
            options={operatorOptions}
            placeholder="Seleziona..."
            searchPlaceholder="Cerca operatore..."
            emptyMessage="Nessun operatore."
            onChange={(v) => setSelectedOperatorId(v ?? '')}
          />
        </div>
      </div>

      <div className="flex justify-end border-t pt-4">
        <Button
          disabled={state.manualRows.length === 0 || createJob.isPending}
          onClick={() => void handleSubmit()}
        >
          {createJob.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Creazione...
            </>
          ) : (
            'Crea operazioni'
          )}
        </Button>
      </div>

      <BrogliaccioImportDialog
        open={brogliaccioOpen}
        onOpenChange={setBrogliaccioOpen}
        onImport={planning.addManualRows}
        productionUnitOptions={puOptions}
      />
    </div>
  );
}
