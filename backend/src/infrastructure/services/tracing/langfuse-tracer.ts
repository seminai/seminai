import type { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { CallbackHandler } from '@langfuse/langchain';
import { LangfuseSpanProcessor } from '@langfuse/otel';
import { setLangfuseTracerProvider } from '@langfuse/tracing';
import { NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { logger } from '../logger.service';

let handler: CallbackHandler | null = null;
let providerReady = false;

function isTracingEnabled(): boolean {
  return (
    process.env.LANGFUSE_TRACING === 'true' &&
    !!process.env.LANGFUSE_PUBLIC_KEY &&
    !!process.env.LANGFUSE_SECRET_KEY
  );
}

function ensureLangfuseProvider(): void {
  if (providerReady) return;
  const processor = new LangfuseSpanProcessor({
    publicKey: process.env.LANGFUSE_PUBLIC_KEY,
    secretKey: process.env.LANGFUSE_SECRET_KEY,
    baseUrl: process.env.LANGFUSE_BASE_URL,
    exportMode: 'immediate',
  });
  const provider = new NodeTracerProvider({ spanProcessors: [processor] });
  setLangfuseTracerProvider(provider);
  providerReady = true;
}

/**
 * Builds the Langfuse tracing callbacks for a LangGraph run, capturing every
 * LLM and tool call as a nested trace in the self-hosted Langfuse UI.
 *
 * Env-gated and fail-safe: returns an empty array (tracing off) when disabled or
 * on any initialization error, so a tracing misconfiguration never breaks the
 * agent. Bind the result via `compiledGraph.withConfig({ callbacks })`.
 */
export function buildTracingCallbacks(): BaseCallbackHandler[] {
  if (!isTracingEnabled()) return [];
  try {
    ensureLangfuseProvider();
    if (!handler) {
      handler = new CallbackHandler();
      logger.info('[TRACING] Langfuse enabled', { baseUrl: process.env.LANGFUSE_BASE_URL });
    }
    return [handler as unknown as BaseCallbackHandler];
  } catch (err) {
    logger.warn('[TRACING] Langfuse init failed — continuing untraced', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
