import { z } from 'zod';
import { DEFAULT_AGENT_TIMEOUT_MS, DEFAULT_HTTP_TIMEOUT_MS } from './config.js';

const DEFAULT_PORT = 8080;
const DEFAULT_ORIGINS = [
  'https://claude.ai',
  'https://claude.com',
  'https://chatgpt.com',
  'https://chat.openai.com',
] as const;

const schema = z.object({
  apiBaseUrl: z.string().url(),
  publicBaseUrl: z.string().url(),
  oauthSigningKey: z.string().min(16),
  redisUrl: z.string().optional(),
  serverName: z.string().default('seminai'),
  serverVersion: z.string().default('0.0.1'),
  httpTimeoutMs: z.number().positive().default(DEFAULT_HTTP_TIMEOUT_MS),
  agentTimeoutMs: z.number().positive().default(DEFAULT_AGENT_TIMEOUT_MS),
  port: z.number().int().positive().default(DEFAULT_PORT),
});

export type HttpMcpConfig = z.infer<typeof schema> & {
  readonly allowedOrigins: readonly string[];
  readonly resourceUrl: string;
};

function parsePositive(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function stripSlash(url: string): string {
  return url.replace(/\/$/, '');
}

export function loadHttpConfig(env: NodeJS.ProcessEnv = process.env): HttpMcpConfig {
  const parsed = schema.safeParse({
    apiBaseUrl: env.SEMINAI_API_BASE_URL,
    publicBaseUrl: env.PUBLIC_BASE_URL,
    oauthSigningKey: env.MCP_OAUTH_SIGNING_KEY,
    redisUrl: env.REDIS_URL || undefined,
    serverName: env.SEMINAI_MCP_SERVER_NAME,
    serverVersion: env.SEMINAI_MCP_SERVER_VERSION,
    httpTimeoutMs: parsePositive(env.SEMINAI_MCP_HTTP_TIMEOUT_MS, DEFAULT_HTTP_TIMEOUT_MS),
    agentTimeoutMs: parsePositive(env.SEMINAI_MCP_AGENT_TIMEOUT_MS, DEFAULT_AGENT_TIMEOUT_MS),
    port: parsePositive(env.PORT, DEFAULT_PORT),
  });
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid Seminai MCP HTTP config: ${issues}`);
  }
  const publicBaseUrl = stripSlash(parsed.data.publicBaseUrl);
  return {
    ...parsed.data,
    apiBaseUrl: stripSlash(parsed.data.apiBaseUrl),
    publicBaseUrl,
    resourceUrl: `${publicBaseUrl}/mcp`,
    allowedOrigins: DEFAULT_ORIGINS,
  };
}
