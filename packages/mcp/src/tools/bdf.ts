import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const BDF_LIST_CROPS_TOOL_NAME = 'seminai_bdf_list_crops';
export const BDF_LIST_PESTS_TOOL_NAME = 'seminai_bdf_list_pests_for_crop';
export const BDF_SEARCH_PRODUCTS_TOOL_NAME = 'seminai_bdf_search_products';
export const BDF_GET_DOSES_TOOL_NAME = 'seminai_bdf_get_doses';
export const BDF_AUTHORIZED_CROPS_TOOL_NAME = 'seminai_bdf_authorized_crops_for_product';

function toToolResult(
  data: unknown,
): ReturnType<typeof jsonContent> | ReturnType<typeof errorContent> {
  return jsonContent(data);
}

function toErrorResult(err: unknown): ReturnType<typeof errorContent> {
  if (err instanceof SeminaiHttpError) {
    return errorContent(`Seminai API error (${err.status}): ${err.message}`);
  }
  return errorContent(`Unexpected error: ${(err as Error).message}`);
}

export async function bdfListCropsHandler(
  http: SeminaiHttpClient,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return toToolResult(await http.get<unknown>('/bdf/colture'));
  } catch (err) {
    return toErrorResult(err);
  }
}

export const bdfListPestsShape = {
  coltura: z
    .string()
    .min(1)
    .describe('BDF crop code (codice coltura) returned by seminai_bdf_list_crops.'),
};

export async function bdfListPestsHandler(
  http: SeminaiHttpClient,
  args: { coltura: string },
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return toToolResult(
      await http.get<unknown>('/bdf/avversita', { query: { coltura: args.coltura } }),
    );
  } catch (err) {
    return toErrorResult(err);
  }
}

export const bdfSearchProductsShape = {
  ricalfa: z
    .string()
    .optional()
    .describe('Free-text search on product name or active substance (alphabetical).'),
  coltura: z.string().optional().describe('Filter by BDF crop code.'),
  avversita: z.string().optional().describe('Filter by BDF pest code.'),
  dettbio: z
    .string()
    .optional()
    .describe('Detail flag passed through to BDF (typically "S" or "N").'),
  tipologia: z.string().optional().describe('Filter by product type code.'),
  codSA: z.string().optional().describe('Filter by active substance code.'),
};

export async function bdfSearchProductsHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof bdfSearchProductsShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return toToolResult(
      await http.get<unknown>('/bdf/prodotti', {
        query: {
          ricalfa: args.ricalfa,
          coltura: args.coltura,
          avversita: args.avversita,
          dettbio: args.dettbio,
          tipologia: args.tipologia,
          codSA: args.codSA,
        },
      }),
    );
  } catch (err) {
    return toErrorResult(err);
  }
}

export const bdfGetDosesShape = {
  codprod: z.string().min(1).describe('BDF product code (codice formulato commerciale).'),
  coltura: z.string().min(1).describe('BDF crop code.'),
  avversita: z.string().optional().describe('Optional BDF pest code.'),
  datatrattamento: z.string().optional().describe('Optional treatment date in YYYY-MM-DD format.'),
};

export async function bdfGetDosesHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof bdfGetDosesShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return toToolResult(
      await http.get<unknown>('/bdf/dosi', {
        query: {
          codprod: args.codprod,
          coltura: args.coltura,
          avversita: args.avversita,
          datatrattamento: args.datatrattamento,
        },
      }),
    );
  } catch (err) {
    return toErrorResult(err);
  }
}

export const bdfAuthorizedCropsShape = {
  codice: z.string().min(1).describe('BDF product code (codice formulato commerciale).'),
};

export async function bdfAuthorizedCropsHandler(
  http: SeminaiHttpClient,
  args: { codice: string },
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return toToolResult(
      await http.get<unknown>('/bdf/impieghi', { query: { codice: args.codice } }),
    );
  } catch (err) {
    return toErrorResult(err);
  }
}

export const registerBdfTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    BDF_LIST_CROPS_TOOL_NAME,
    'List all crops in the Italian Banca Dati Fitofarmaci (BDF) reference dataset.',
    {},
    () => bdfListCropsHandler(http),
  );
  server.tool(
    BDF_LIST_PESTS_TOOL_NAME,
    'List BDF pests/diseases authorised against a given crop. Requires a BDF crop code.',
    bdfListPestsShape,
    (args) => bdfListPestsHandler(http, args),
  );
  server.tool(
    BDF_SEARCH_PRODUCTS_TOOL_NAME,
    'Search BDF phytopharmaceutical products by free text and/or filters (crop, pest, type, active substance).',
    bdfSearchProductsShape,
    (args) => bdfSearchProductsHandler(http, args),
  );
  server.tool(
    BDF_GET_DOSES_TOOL_NAME,
    'Get authorised dosages for a BDF product on a specific crop and (optionally) pest. Returns min/max dose, concentrations and label constraints.',
    bdfGetDosesShape,
    (args) => bdfGetDosesHandler(http, args),
  );
  server.tool(
    BDF_AUTHORIZED_CROPS_TOOL_NAME,
    'List the crops a BDF product is authorised on. Useful to verify whether a treatment plan is compliant with the product label.',
    bdfAuthorizedCropsShape,
    (args) => bdfAuthorizedCropsHandler(http, args),
  );
};
