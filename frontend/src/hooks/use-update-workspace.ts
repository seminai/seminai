import { useMutation } from '@tanstack/react-query';
import { customFetch } from '@/lib/api-client';
import type { UpdateWorkspacePayload } from '@/types/workspace';

interface UpdateWorkspaceVars {
  readonly id: string;
  readonly data: UpdateWorkspacePayload;
}

function updateWorkspace({ id, data }: UpdateWorkspaceVars) {
  return customFetch(`/workspaces/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export function useUpdateWorkspace() {
  return useMutation({ mutationFn: updateWorkspace });
}
