export const DEFAULT_WORKSPACE_ID = 'seminai-default' as const;

/** Omit the FE-only default workspace sentinel before sending workspaceId to the API. */
export function resolveApiWorkspaceId(workspaceId: string): string | undefined {
  return workspaceId !== DEFAULT_WORKSPACE_ID ? workspaceId : undefined;
}
