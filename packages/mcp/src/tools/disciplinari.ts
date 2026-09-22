import { z } from 'zod';
import type { SeminaiHttpClient } from '../client/http.js';
import { SeminaiHttpError } from '../client/http-errors.js';
import { errorContent, jsonContent, type ToolRegistrar } from './types.js';

export const DISCIPLINARI_LIST_TOOL_NAME = 'seminai_disciplinari_list';
export const DISCIPLINARI_SEARCH_TOOL_NAME = 'seminai_disciplinari_search';
export const DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME = 'seminai_disciplinari_check_validity';
export const DISCIPLINARI_EXPIRING_SOON_TOOL_NAME = 'seminai_disciplinari_expiring_soon';

function toErrorResult(err: unknown, context: string): ReturnType<typeof errorContent> {
  if (err instanceof SeminaiHttpError) {
    return errorContent(`Seminai API error during ${context} (${err.status}): ${err.message}`);
  }
  return errorContent(`Unexpected error during ${context}: ${(err as Error).message}`);
}

export async function disciplinariListHandler(
  http: SeminaiHttpClient,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(await http.get<unknown>('/disciplinari/summary'));
  } catch (err) {
    return toErrorResult(err, 'disciplinari_list');
  }
}

export const disciplinariSearchShape = {
  region: z.string().min(1).describe('Italian region name (e.g. "Lombardia", "Emilia-Romagna").'),
  year: z.number().int().min(2000).max(2100).describe('Year of the disciplinare.'),
};

export async function disciplinariSearchHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof disciplinariSearchShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(
      await http.get<unknown>('/disciplinari/search', {
        query: { region: args.region, year: args.year },
      }),
    );
  } catch (err) {
    return toErrorResult(err, 'disciplinari_search');
  }
}

export const disciplinariCheckValidityShape = {
  region: z.string().min(1).describe('Italian region name.'),
  year: z.number().int().min(2000).max(2100).describe('Year of the disciplinare.'),
};

export async function disciplinariCheckValidityHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof disciplinariCheckValidityShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(
      await http.get<unknown>('/disciplinari/check-validity', {
        query: { region: args.region, year: args.year },
      }),
    );
  } catch (err) {
    return toErrorResult(err, 'disciplinari_check_validity');
  }
}

export const disciplinariExpiringSoonShape = {
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .default(30)
    .describe('Look-ahead window in days (default 30).'),
};

export async function disciplinariExpiringSoonHandler(
  http: SeminaiHttpClient,
  args: z.infer<z.ZodObject<typeof disciplinariExpiringSoonShape>>,
): Promise<ReturnType<typeof jsonContent> | ReturnType<typeof errorContent>> {
  try {
    return jsonContent(
      await http.get<unknown>('/disciplinari/expiring-soon', {
        query: { days: args.days },
      }),
    );
  } catch (err) {
    return toErrorResult(err, 'disciplinari_expiring_soon');
  }
}

export const registerDisciplinariTools: ToolRegistrar = (server, { http }) => {
  server.tool(
    DISCIPLINARI_LIST_TOOL_NAME,
    'List a summary of every disciplinare di produzione integrata extracted into Seminai.',
    {},
    () => disciplinariListHandler(http),
  );
  server.tool(
    DISCIPLINARI_SEARCH_TOOL_NAME,
    'Search disciplinari by Italian region and year. Returns the matching extractions, including products, doses and pest restrictions.',
    disciplinariSearchShape,
    (args) => disciplinariSearchHandler(http, args),
  );
  server.tool(
    DISCIPLINARI_CHECK_VALIDITY_TOOL_NAME,
    'Check whether a disciplinare for a region/year combination is currently valid. Returns flags exists, isValid, isExpired, needsUpdate and validUntil.',
    disciplinariCheckValidityShape,
    (args) => disciplinariCheckValidityHandler(http, args),
  );
  server.tool(
    DISCIPLINARI_EXPIRING_SOON_TOOL_NAME,
    'List disciplinari expiring within the next N days. Useful as an early warning for disciplinari that need to be re-uploaded soon.',
    disciplinariExpiringSoonShape,
    (args) => disciplinariExpiringSoonHandler(http, args),
  );
};
