import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import {
  getGetWorkspacesIdCompaniesQueryKey,
  useGetWorkspacesIdCompanies,
  usePutWorkspacesIdCompanies,
} from '@/generated/api/workspaces/workspaces';
import { getGetCompaniesQueryKey } from '@/generated/api/companies/companies';
import { extractArray } from '@/lib/api-response';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkspaceCompanyPicker } from '@/components/molecules/workspace-company-picker';
import type { WorkspaceKind } from '@/types/workspace';

interface WorkspaceAssignedCompaniesSectionProps {
  readonly workspaceId: string;
  readonly workspaceKind: WorkspaceKind | null;
}

export function WorkspaceAssignedCompaniesSection({
  workspaceId,
  workspaceKind,
}: WorkspaceAssignedCompaniesSectionProps) {
  const queryClient = useQueryClient();
  const kind = workspaceKind ?? 'AGRICULTURAL';
  const assignmentsQuery = useGetWorkspacesIdCompanies(workspaceId);
  const replaceMutation = usePutWorkspacesIdCompanies();

  const assignedIds = extractArray(assignmentsQuery.data?.data, 'companies').map((item) =>
    String(item.companyId ?? ''),
  );
  const [selectedIds, setSelectedIds] = useState<readonly string[]>([]);

  useEffect(() => {
    setSelectedIds(assignedIds.filter((id) => id.length > 0));
  }, [assignedIds.join('|')]);

  const hasChanges =
    selectedIds.length !== assignedIds.length ||
    selectedIds.some((id) => !assignedIds.includes(id));

  function handleSave() {
    replaceMutation.mutate(
      {
        id: workspaceId,
        data: { companyIds: [...selectedIds] },
      },
      {
        onSuccess: () => {
          toast.success('Aziende del workspace aggiornate');
          void queryClient.invalidateQueries({
            queryKey: getGetWorkspacesIdCompaniesQueryKey(workspaceId),
          });
          void queryClient.invalidateQueries({ queryKey: getGetCompaniesQueryKey() });
        },
        onError: () => toast.error('Impossibile aggiornare le aziende del workspace'),
      },
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Aziende assegnate</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <WorkspaceCompanyPicker
          kind={kind}
          selectedIds={selectedIds}
          onChange={setSelectedIds}
          disabled={assignmentsQuery.isLoading || replaceMutation.isPending}
        />
        <div className="flex justify-end">
          <Button
            type="button"
            onClick={handleSave}
            disabled={!hasChanges || replaceMutation.isPending || assignmentsQuery.isLoading}
          >
            {replaceMutation.isPending && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            <Save className="mr-1 h-4 w-4" />
            Salva aziende
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
