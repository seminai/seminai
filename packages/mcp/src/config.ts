import { z } from 'zod';

export const DEFAULT_HTTP_TIMEOUT_MS = 30_000;
export const DEFAULT_AGENT_TIMEOUT_MS = 180_000;

const numericFromEnv = z
  .union([z.string(), z.number()])
  .optional()
  .transform((value, ctx) => {
    if (value === undefined || value === '') return undefined;
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'must be a positive number' });
      return z.NEVER;
    }
    return parsed;
  });

const configSchema = z.object({
  apiBaseUrl: z.string().url(),
  apiToken: z.string().min(1),
  serverName: z.string().default('seminai'),
  serverVersion: z.string().default('0.0.1'),
  /**
   * Default per-request HTTP timeout for the SeminaiHttpClient.
   * Applied to all read/CRUD endpoints unless overridden per-tool.
   */
  httpTimeoutMs: numericFromEnv.default(DEFAULT_HTTP_TIMEOUT_MS),
  /**
   * Longer timeout reserved for LLM-bound agent endpoints
   * (/agent-chat/message, /agent-chat/approve, /agent-chat/reject,
   * /agent-chat/state). The dosage agent can chain many tool calls and
   * easily exceed the default httpTimeoutMs.
   */
  agentTimeoutMs: numericFromEnv.default(DEFAULT_AGENT_TIMEOUT_MS),
});

export type SeminaiMcpConfig = z.infer<typeof configSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SeminaiMcpConfig {
  const parsed = configSchema.safeParse({
    apiBaseUrl: env.SEMINAI_API_BASE_URL,
    apiToken: env.SEMINAI_API_TOKEN,
    serverName: env.SEMINAI_MCP_SERVER_NAME,
    serverVersion: env.SEMINAI_MCP_SERVER_VERSION,
    httpTimeoutMs: env.SEMINAI_MCP_HTTP_TIMEOUT_MS,
    agentTimeoutMs: env.SEMINAI_MCP_AGENT_TIMEOUT_MS,
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid Seminai MCP config: ${issues}`);
  }
  return parsed.data;
}
