import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_MACHINES_TOOL_NAME = 'seminai_list_machines_by_company';
export const LIST_MACHINES_TOOL_DESCRIPTION =
  'List all machines registered for a specific company. Requires the companyId.';

export const listMachinesShape = {
  companyId: z.string().min(1).describe('The Seminai company id whose machines should be listed.'),
};

export async function listMachinesHandler(
  http: SeminaiHttpClient,
  args: { companyId: string },
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>(`/machines/company/${encodeURIComponent(args.companyId)}`);
    return jsonContent(data);
  } catch (err) {
    if (err instanceof SeminaiHttpError) {
      return errorContent(`Seminai API error (${err.status}): ${err.message}`);
    }
    return errorContent(`Unexpected error: ${(err as Error).message}`);
  }
}

export const registerMachinesTools: ToolRegistrar = (server, { http }) => {
  server.tool(LIST_MACHINES_TOOL_NAME, LIST_MACHINES_TOOL_DESCRIPTION, listMachinesShape, (args) =>
    listMachinesHandler(http, args),
  );
};
