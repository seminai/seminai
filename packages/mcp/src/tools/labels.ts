import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError, SeminaiNotFoundError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const GET_LABEL_TOOL_NAME = 'seminai_get_label';
export const GET_LABEL_TOOL_DESCRIPTION =
  'Get the label of a phytopharmaceutical product by its commercial name and registration number. ' +
  'Always tries the Seminai cache first (free, fast). If not cached and allowLiveSianExtraction is true, ' +
  'falls back to live SIAN scraping (slow, consumes user credits). The returned object always includes a ' +
  '"source" field indicating which layer answered: "seminai_cache" or "sian_live_extraction".';

export const getLabelShape = {
  productName: z
    .string()
    .min(1)
    .describe('Commercial product name (matched case-insensitively against the Seminai cache).'),
  registrationNumber: z
    .string()
    .min(1)
    .describe('Italian SIAN registration number of the product.'),
  allowLiveSianExtraction: z
    .boolean()
    .default(false)
    .describe(
      'If false (default), only the Seminai cache is consulted; cache miss returns an explicit error. ' +
        'If true, on cache miss the tool performs a live SIAN extraction which is slow and consumes user credits.',
    ),
};

export type GetLabelArgs = {
  productName: string;
  registrationNumber: string;
  allowLiveSianExtraction: boolean;
};

export async function getLabelHandler(
  http: SeminaiHttpClient,
  args: GetLabelArgs,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  const query = { name: args.productName, regNumber: args.registrationNumber };

  try {
    const cached = await http.get<unknown>('/labels/by-product', { query });
    return jsonContent({ source: 'seminai_cache', label: cached });
  } catch (err) {
    if (!(err instanceof SeminaiNotFoundError)) {
      return mapHttpError(err, 'cache lookup');
    }
  }

  if (!args.allowLiveSianExtraction) {
    return errorContent(
      `Label not found in Seminai cache for "${args.productName}" (reg. ${args.registrationNumber}). ` +
        'Live SIAN extraction is disabled by default because it is slow and consumes user credits. ' +
        'Re-run this tool with allowLiveSianExtraction=true to authorize a live SIAN extraction.',
    );
  }

  try {
    const extracted = await http.get<unknown>('/labels/extract', { query });
    return jsonContent({ source: 'sian_live_extraction', label: extracted });
  } catch (err) {
    if (err instanceof SeminaiNotFoundError) {
      return errorContent(
        `Label not found in Seminai cache and SIAN returned 404 for "${args.productName}" ` +
          `(reg. ${args.registrationNumber}). The product may not exist on SIAN or its registration number is wrong.`,
      );
    }
    return mapHttpError(err, 'SIAN live extraction');
  }
}

function mapHttpError(err: unknown, stage: string): ReturnType<typeof errorContent> {
  if (err instanceof SeminaiHttpError) {
    return errorContent(`Seminai API error during ${stage} (${err.status}): ${err.message}`);
  }
  return errorContent(`Unexpected error during ${stage}: ${(err as Error).message}`);
}

export const registerLabelsTools: ToolRegistrar = (server, { http }) => {
  server.tool(GET_LABEL_TOOL_NAME, GET_LABEL_TOOL_DESCRIPTION, getLabelShape, (args) =>
    getLabelHandler(http, args as GetLabelArgs),
  );
};
