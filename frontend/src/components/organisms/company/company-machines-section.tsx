import { useMemo, useState } from 'react';
import { MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Section, SimpleTable, EmptyState } from '@/components/molecules/section-table';
import { ConfirmDeleteDialog } from '@/components/molecules/confirm-delete-dialog';
import {
  useGetMachinesCompanyCompanyId,
  useDeleteMachinesBulk,
  getGetMachinesCompanyCompanyIdQueryKey,
} from '@/generated/api/machines/machines';
import { extractArray } from '@/lib/api-response';
import { useCompanyRole } from '@/hooks/use-company-role';
import {
  MachineFormSheet,
  type MachineInitialData,
} from '@/components/organisms/company/machine-form-sheet';

const formatDate = (value: unknown): string => {
  if (!value || typeof value !== 'string') return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString('it-IT');
};

interface MachineRow extends MachineInitialData {
  readonly displayLastRevision: string;
  readonly displayCalibration: string;
}

interface CompanyMachinesSectionProps {
  readonly companyId: string;
}

export function CompanyMachinesSection({ companyId }: CompanyMachinesSectionProps) {
  const queryClient = useQueryClient();
  const { canManage } = useCompanyRole(companyId);
  const { data: machinesRes } = useGetMachinesCompanyCompanyId(companyId);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MachineRow | null>(null);
  const [deleting, setDeleting] = useState<MachineRow | null>(null);

  const machines = useMemo<MachineRow[]>(() => {
    if (!machinesRes?.data) return [];
    return extractArray(machinesRes.data, 'machines').map((m) => ({
      id: String(m.id ?? ''),
      name: typeof m.name === 'string' ? m.name : undefined,
      identifier: typeof m.identifier === 'string' ? m.identifier : undefined,
      lastPositiveRevisionDate:
        typeof m.lastPositiveRevisionDate === 'string' ? m.lastPositiveRevisionDate : undefined,
      functionalControlDate:
        typeof m.functionalControlDate === 'string' ? m.functionalControlDate : undefined,
      calibrationDate: typeof m.calibrationDate === 'string' ? m.calibrationDate : undefined,
      revisionReminderDays:
        typeof m.revisionReminderDays === 'number' ? m.revisionReminderDays : undefined,
      calibrationReminderDays:
        typeof m.calibrationReminderDays === 'number' ? m.calibrationReminderDays : undefined,
      functionalControlReminderDays:
        typeof m.functionalControlReminderDays === 'number'
          ? m.functionalControlReminderDays
          : undefined,
      displayLastRevision: formatDate(m.lastPositiveRevisionDate),
      displayCalibration: formatDate(m.calibrationDate),
    }));
  }, [machinesRes]);

  const deleteMutation = useDeleteMachinesBulk({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetMachinesCompanyCompanyIdQueryKey(companyId),
        });
        toast.success('Macchina eliminata');
        setDeleting(null);
      },
      onError: () => toast.error("Errore durante l'eliminazione della macchina"),
    },
  });

  const headers = canManage
    ? ['Nome', 'Identificativo', 'Ultima Revisione', 'Calibrazione', '']
    : ['Nome', 'Identificativo', 'Ultima Revisione', 'Calibrazione'];

  const rows = machines.map((m) => {
    const cells: React.ReactNode[] = [
      m.name ?? '-',
      m.identifier ?? '-',
      m.displayLastRevision,
      m.displayCalibration,
    ];
    if (canManage) {
      cells.push(
        <DropdownMenu key="actions">
          <DropdownMenuTrigger
            render={<Button variant="ghost" size="icon-sm" />}
            aria-label="Azioni"
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(m)}>
              <Pencil className="mr-2 h-4 w-4" />
              Modifica
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setDeleting(m)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Elimina
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>,
      );
    }
    return cells;
  });

  return (
    <>
      <Section
        title="Macchine"
        count={machines.length}
        action={
          canManage ? (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Aggiungi macchina
            </Button>
          ) : undefined
        }
      >
        {machines.length === 0 ? <EmptyState /> : <SimpleTable headers={headers} rows={rows} />}
      </Section>

      {canManage && (
        <>
          <MachineFormSheet
            companyId={companyId}
            open={createOpen}
            onOpenChange={setCreateOpen}
          />
          <MachineFormSheet
            companyId={companyId}
            open={!!editing}
            onOpenChange={(o) => !o && setEditing(null)}
            initialData={editing}
          />
          <ConfirmDeleteDialog
            open={!!deleting}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Elimina macchina"
            description={
              deleting
                ? `Vuoi eliminare la macchina "${deleting.name ?? deleting.id}"? L'operazione è irreversibile.`
                : ''
            }
            isPending={deleteMutation.isPending}
            onConfirm={() => {
              if (deleting) deleteMutation.mutate({ data: { ids: [deleting.id] } });
            }}
          />
        </>
      )}
    </>
  );
}
