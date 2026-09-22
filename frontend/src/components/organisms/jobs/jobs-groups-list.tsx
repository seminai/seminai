import type { ColumnDef } from '@tanstack/react-table';
import { DataTableSwitch } from '@/components/organisms/data-table-switch';
import { InfoTooltip } from '@/components/atoms/info-tooltip';
import { VerificationStatusLegend } from '@/components/molecules/verification-status-legend';
import { formatCompanyWithJobGroupCode } from '@/lib/job-group-format';
import type { JobGroupRow } from './types';

interface JobsGroupsListProps {
  readonly groups: readonly JobGroupRow[];
  readonly selectedGroupId: string | null;
  readonly onSelectGroup: (jobId: string) => void;
}

const columnLabels: Record<string, string> = {
  jobId: 'Gruppo',
  companyName: 'Azienda',
  createdAt: 'Data',
  totalOperations: 'Totale',
  verifiedOperations: 'Verificati',
  pendingOperations: 'In attesa',
};

const columns: ColumnDef<JobGroupRow, unknown>[] = [
  {
    id: 'companyName',
    accessorFn: (group) => formatCompanyWithJobGroupCode(group.companyName, group.jobId),
    header: 'Azienda',
    filterFn: 'multiValue' as never,
  },
  { accessorKey: 'createdAt', header: 'Data', filterFn: 'multiValue' as never },
  { accessorKey: 'totalOperations', header: 'Totale', filterFn: 'multiValue' as never },
  { accessorKey: 'verifiedOperations', header: 'Verificati', filterFn: 'multiValue' as never },
  { accessorKey: 'pendingOperations', header: 'In attesa', filterFn: 'multiValue' as never },
];

export function JobsGroupsList({ groups, selectedGroupId, onSelectGroup }: JobsGroupsListProps) {
  const selectedGroup = selectedGroupId ? groups.find((group) => group.jobId === selectedGroupId) ?? null : null;

  if (groups.length === 0) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Non ci sono gruppi job</p>;
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-1.5 border-b px-3 py-1.5 text-[0.7rem] text-muted-foreground sm:px-4 sm:text-xs">
        <span>Verificati / In attesa</span>
        <InfoTooltip title="Legenda stato verifica">
          <VerificationStatusLegend />
        </InfoTooltip>
      </div>
      <DataTableSwitch
        data={groups}
        columns={columns}
        columnLabels={columnLabels}
        exportSection="job-groups"
        onRowClick={(group) => onSelectGroup(group.jobId)}
      />
      {selectedGroupId ? (
        <div className="border-t px-4 py-2 text-xs text-muted-foreground">
          Gruppo selezionato:{' '}
          {selectedGroup
            ? `${formatCompanyWithJobGroupCode(selectedGroup.companyName, selectedGroup.jobId)} - ${selectedGroup.createdAt}`
            : 'attivo'}
        </div>
      ) : null}
    </div>
  );
}
