import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_FIELDS_TOOL_NAME = 'seminai_list_fields';
export const LIST_FIELDS_TOOL_DESCRIPTION =
  'List all fields across every company the authenticated user has access to, including linked production units.';

export async function listFieldsHandler(
  http: SeminaiHttpClient,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>('/fields');
    return jsonContent(data);
  } catch (err) {
    if (err instanceof SeminaiHttpError) {
      return errorContent(`Seminai API error (${err.status}): ${err.message}`);
    }
    return errorContent(`Unexpected error: ${(err as Error).message}`);
  }
}

export const registerFieldsTools: ToolRegistrar = (server, { http }) => {
  server.tool(LIST_FIELDS_TOOL_NAME, LIST_FIELDS_TOOL_DESCRIPTION, {}, () =>
    listFieldsHandler(http),
  );
};
