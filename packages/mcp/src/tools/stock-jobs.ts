import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const LIST_MY_PRODUCTS_TOOL_NAME = 'seminai_list_my_products';
export const LIST_MY_JOBS_TOOL_NAME = 'seminai_list_my_jobs';
export const LIST_MY_VERIFIED_JOBS_TOOL_NAME = 'seminai_list_my_verified_jobs';
export const SEARCH_MENTIONS_TOOL_NAME = 'seminai_search_mentions';

function toErrorResult(err: unknown, context: string): ReturnType<typeof errorContent> {
  if (err instanceof SeminaiHttpError) {
    return errorContent(`Seminai API error during ${context} (${err.status}): ${err.message}`);
  }
  return errorContent(`Unexpected error during ${context}: ${(err as Error).message}`);
}

export const listMyProductsShape = {
  companyName: z.string().optional().describe('Optional case-insensitive filter on company name.'),
  compact: z
    .boolean()
    .optional()
    .default(true)
    .describe(
      'When true (default), returns minimal fields per product (id, name, category, ' +
        'registrationNumber, activeSubstances, stockTotal, warehouse, company) to keep agent ' +
        'context small. Set false for the full payload including labelMetadata, stocks, ' +
        'fertilizer composition (large, may saturate agent context).',
    ),
};

interface CompactProduct {
  id: string | null;
  name: string | null;
  category: string | null;
  registrationNumber: string | null;
  administrativeStatus: string | null;
  activeSubstances: string[];
  stockTotal: number;
  warehouseName: string | null;
  companyId: string | null;
  companyName: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function sumStocks(stocks: unknown): number {
  if (!Array.isArray(stocks)) return 0;
  let total = 0;
  for (const item of stocks) {
    if (isRecord(item) && typeof item.quantity === 'number' && Number.isFinite(item.quantity)) {
      total += item.quantity;
    }
  }
  return total;
}

function extractActiveSubstances(labelMetadata: unknown): string[] {
  if (!isRecord(labelMetadata)) return [];
  const subs = labelMetadata.activeSubstances;
  if (!Array.isArray(subs)) return [];
  return subs.filter((s): s is string => typeof s === 'string');
}

function projectProduct(entry: unknown): CompactProduct {
  if (!isRecord(entry)) {
    return {
      id: null,
      name: null,
      category: null,
      registrationNumber: null,
      administrativeStatus: null,
      activeSubstances: [],
      stockTotal: 0,
      warehouseName: null,
      companyId: null,
      companyName: null,
    };
  }
  const warehouse = isRecord(entry.warehouse) ? entry.warehouse : undefined;
  const company = warehouse && isRecord(warehouse.company) ? warehouse.company : undefined;
  return {
    id: asString(entry.id),
    name: asString(entry.name),
    category: asString(entry.category),
    registrationNumber: asString(entry.registrationNumber),
    administrativeStatus: asString(entry.administrativeStatus),
    activeSubstances: extractActiveSubstances(entry.labelMetadata),
    stockTotal: sumStocks(entry.stocks),
    warehouseName: warehouse ? asString(warehouse.name) : null,
    companyId: company ? asString(company.id) : null,
    companyName: company ? asString(company.name) : null,
  };
}

export function compactMyProductsResponse(payload: unknown): unknown {
  const products = extractProductsArray(payload);
  if (!products) return payload;
  const compact = products.map(projectProduct);
  return { status: 'success', data: { products: compact, count: compact.length } };
}

function extractProductsArray(payload: unknown): unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (!isRecord(payload)) return null;
  if (Array.isArray(payload.products)) return payload.products;
  if (isRecord(payload.data)) {
    if (Array.isArray(payload.data.products)) return payload.data.products;
    if (Array.isArray(payload.data)) return payload.data;
  }
  return null;
}

export async function listMyProductsHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof listMyProductsShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    const raw = await http.get<unknown>('/products/me', {
      query: { companyName: args.companyName },
    });
    return jsonContent(args.compact ? compactMyProductsResponse(raw) : raw);
  } catch (err) {
    return toErrorResult(err, 'list_my_products');
  }
}

export const listMyJobsShape = {
  companyName: z.string().optional().describe('Optional case-insensitive filter on company name.'),
};

export async function listMyJobsHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof listMyJobsShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(
      await http.get<unknown>('/jobs/me', {
        query: { companyName: args.companyName },
      }),
    );
  } catch (err) {
    return toErrorResult(err, 'list_my_jobs');
  }
}

export const listMyVerifiedJobsShape = {
  companyName: z.string().optional().describe('Optional company name filter.'),
  page: z.number().int().min(1).optional().describe('Page number (1-based).'),
  limit: z.number().int().min(1).max(200).optional().describe('Page size, max 200.'),
};

export async function listMyVerifiedJobsHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof listMyVerifiedJobsShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(
      await http.get<unknown>('/jobs/me/verified', {
        query: {
          companyName: args.companyName,
          page: args.page,
          limit: args.limit,
        },
      }),
    );
  } catch (err) {
    return toErrorResult(err, 'list_my_verified_jobs');
  }
}

export const searchMentionsShape = {
  q: z.string().min(1).describe('Free-text query for autocompleting entities.'),
  types: z
    .string()
    .optional()
    .describe(
      'Optional comma-separated list of entity types to filter by ' +
        '(e.g. "company,product,field,production_unit,stock,file").',
    ),
};

export async function searchMentionsHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof searchMentionsShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(
      await http.get<unknown>('/mentions/search', {
        query: { q: args.q, types: args.types },
      }),
    );
  } catch (err) {
    return toErrorResult(err, 'search_mentions');
  }
}

export const registerStockJobsTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    LIST_MY_PRODUCTS_TOOL_NAME,
    "List products across the authenticated user's companies, including verified stock history, warehouse name and company info. Optional companyName filter.",
    listMyProductsShape,
    (args) => listMyProductsHandler(http, args),
  );
  server.tool(
    LIST_MY_JOBS_TOOL_NAME,
    'List field-operation jobs assigned to the authenticated user. Optional companyName filter.',
    listMyJobsShape,
    (args) => listMyJobsHandler(http, args),
  );
  server.tool(
    LIST_MY_VERIFIED_JOBS_TOOL_NAME,
    'List jobs that are both verified and conformity-checked (isVerified=true AND conformityChecked=true). Supports pagination.',
    listMyVerifiedJobsShape,
    (args) => listMyVerifiedJobsHandler(http, args),
  );
  server.tool(
    SEARCH_MENTIONS_TOOL_NAME,
    'Autocomplete search across mentionable Seminai entities (companies, products, fields, production units, stocks, files). Returns id, type, label, subtitle for each match.',
    searchMentionsShape,
    (args) => searchMentionsHandler(http, args),
  );
};
