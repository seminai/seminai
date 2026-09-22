import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_WORKSPACES_TOOL_NAME = 'seminai_list_workspaces';
export const LIST_WORKSPACES_TOOL_DESCRIPTION =
  'List all Seminai workspaces the authenticated user belongs to, with their role and basic metadata.';

export async function listWorkspacesHandler(
  http: SeminaiHttpClient,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>('/workspaces');
    return jsonContent(data);
  } catch (err) {
    if (err instanceof SeminaiHttpError) {
      return errorContent(`Seminai API error (${err.status}): ${err.message}`);
    }
    return errorContent(`Unexpected error: ${(err as Error).message}`);
  }
}

export const registerWorkspacesTools: ToolRegistrar = (server, { http }) => {
  server.tool(LIST_WORKSPACES_TOOL_NAME, LIST_WORKSPACES_TOOL_DESCRIPTION, {}, () =>
    listWorkspacesHandler(http),
  );
};
