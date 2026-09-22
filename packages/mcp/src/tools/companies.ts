import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_COMPANIES_TOOL_NAME = 'seminai_list_companies';
export const LIST_COMPANIES_TOOL_DESCRIPTION =
  'List all Seminai companies the authenticated user has access to. Returns id, name, and basic metadata for each company.';

export async function listCompaniesHandler(
  http: SeminaiHttpClient,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>('/companies');
    return jsonContent(data);
  } catch (err) {
    if (err instanceof SeminaiHttpError) {
      return errorContent(`Seminai API error (${err.status}): ${err.message}`);
    }
    return errorContent(`Unexpected error: ${(err as Error).message}`);
  }
}

export const registerCompaniesTools: ToolRegistrar = (server, { http }) => {
  server.tool(LIST_COMPANIES_TOOL_NAME, LIST_COMPANIES_TOOL_DESCRIPTION, {}, () =>
    listCompaniesHandler(http),
  );
};
