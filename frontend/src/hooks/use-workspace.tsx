import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isWorkspaceModule, type Workspace, type WorkspaceKind, type WorkspaceModule } from '@/types/workspace';
import {
  useGetWorkspaces,
  useGetWorkspacesId,
  getGetWorkspacesIdQueryKey,
} from '@/generated/api/workspaces/workspaces';
import { extractArray, extractObject } from '@/lib/api-response';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/hooks/use-auth';

const DEFAULT_WORKSPACE: Workspace = { id: 'seminai-default', name: 'Seminai', logoUrl: '/logo.png' };
const STORAGE_KEY = 'seminai-active-workspace-id';

function readStoredId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_WORKSPACE.id;
  } catch {
    return DEFAULT_WORKSPACE.id;
  }
}

function writeStoredId(id: string) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch { /* ignore */ }
}

function clearStoredId() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

const DEFAULT_MODULES: readonly WorkspaceModule[] = ['DCA'];

interface WorkspaceContextValue {
  readonly workspaces: readonly Workspace[];
  readonly activeWorkspaceId: string;
  readonly setActiveWorkspaceId: (id: string) => void;
  readonly enabledModules: readonly WorkspaceModule[];
  readonly activeWorkspaceKind: WorkspaceKind | null;
  readonly hasModule: (module: WorkspaceModule) => boolean;
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({ children }: { readonly children: React.ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();
  const { data: response } = useGetWorkspaces({ query: { enabled: isAuthenticated } });
  const [activeWorkspaceId, setActiveWorkspaceIdState] = useState(readStoredId);

  const setActiveWorkspaceId = useCallback((id: string) => {
    setActiveWorkspaceIdState(id);
    writeStoredId(id);
  }, []);

  const workspaces = useMemo<Workspace[]>(() => {
    if (!response?.data) return [DEFAULT_WORKSPACE];
    const list = extractArray(response.data, 'workspaces').map((w) => ({
      id: String(w.id ?? ''),
      name: String(w.name ?? '-'),
      logoUrl: w.logoUrl ? String(w.logoUrl) : null,
    }));
    const hasDefault = list.some((w) => w.name === 'Seminai');
    return hasDefault ? list : [DEFAULT_WORKSPACE, ...list];
  }, [response]);

  const effectiveId = workspaces.find((w) => w.id === activeWorkspaceId)
    ? activeWorkspaceId
    : workspaces[0]?.id ?? DEFAULT_WORKSPACE.id;

  const isDefaultWs = effectiveId === DEFAULT_WORKSPACE.id;
  const { data: detailResponse, error: workspaceError } = useGetWorkspacesId(effectiveId, {
    query: { enabled: isAuthenticated && !isDefaultWs, retry: false },
  });

  const enabledModules = useMemo<readonly WorkspaceModule[]>(() => {
    if (isDefaultWs) return DEFAULT_MODULES;
    const workspace = extractObject(detailResponse?.data, 'workspace');
    const modules = extractArray(workspace, 'enabledModules')
      .map((value) => String(value))
      .filter(isWorkspaceModule);
    return modules.length > 0 ? modules : DEFAULT_MODULES;
  }, [detailResponse, isDefaultWs]);

  const hasModule = useCallback(
    (module: WorkspaceModule) => enabledModules.includes(module),
    [enabledModules],
  );

  const activeWorkspaceKind = useMemo<WorkspaceKind | null>(() => {
    if (isDefaultWs) return null;
    const workspace = extractObject(detailResponse?.data, 'workspace');
    const kind = workspace?.kind;
    if (kind === 'AGRICULTURAL' || kind === 'MANUFACTURING') return kind;
    return null;
  }, [detailResponse, isDefaultWs]);

  useEffect(() => {
    if (!(workspaceError instanceof ApiError) || workspaceError.status !== 403) return;
    const badId = effectiveId;
    const fallback = workspaces.find((w) => w.id !== badId)?.id ?? DEFAULT_WORKSPACE.id;
    clearStoredId();
    setActiveWorkspaceIdState(fallback);
    if (fallback !== DEFAULT_WORKSPACE.id) writeStoredId(fallback);
    queryClient.removeQueries({ queryKey: getGetWorkspacesIdQueryKey(badId) });
  }, [workspaceError, effectiveId, workspaces, queryClient]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      activeWorkspaceId: effectiveId,
      setActiveWorkspaceId,
      enabledModules,
      activeWorkspaceKind,
      hasModule,
    }),
    [workspaces, effectiveId, setActiveWorkspaceId, enabledModules, activeWorkspaceKind, hasModule],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider');
  return ctx;
}
