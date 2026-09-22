import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_WAREHOUSES_TOOL_NAME = 'seminai_list_warehouses_by_company';
export const LIST_WAREHOUSES_TOOL_DESCRIPTION =
  'List all warehouses for a specific company. Requires the companyId.';

export const listWarehousesShape = {
  companyId: z
    .string()
    .min(1)
    .describe('The Seminai company id whose warehouses should be listed.'),
};

export async function listWarehousesHandler(
  http: SeminaiHttpClient,
  args: { companyId: string },
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const data = await http.get<unknown>(
      `/warehouses/company/${encodeURIComponent(args.companyId)}`,
    );
    return jsonContent(data);
  } catch (err) {
    if (err instanceof SeminaiHttpError) {
      return errorContent(`Seminai API error (${err.status}): ${err.message}`);
    }
    return errorContent(`Unexpected error: ${(err as Error).message}`);
  }
}

export const registerWarehousesTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    LIST_WAREHOUSES_TOOL_NAME,
    LIST_WAREHOUSES_TOOL_DESCRIPTION,
    listWarehousesShape,
    (args) => listWarehousesHandler(http, args),
  );
};
