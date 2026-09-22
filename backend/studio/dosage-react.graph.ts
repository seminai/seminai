/**
 * LangGraph Studio entrypoint — Dosage ReAct agent.
 *
 * Reuses the production graph topology via `DosageReactGraphFactory.buildWorkflow()`
 * and compiles it WITHOUT a checkpointer, so the LangGraph dev server injects its
 * own in-memory persistence (the documented pattern for Studio / Platform).
 *
 * The factory constructor eagerly builds the LLM clients, so the LLM env vars
 * (OPENROUTER_API_KEY / the active LLM_GATEWAY key) must be present — `dotenv`
 * loads them from `.env` before the factory is instantiated.
 *
 * When `LANGFUSE_TRACING=true` (+ keys), every LLM and tool call of each Studio
 * run is captured as a nested trace in the self-hosted Langfuse UI. The Langfuse
 * callback is bound at config level via `withConfig` so it propagates to all
 * nodes/LLM/tool runs — never at the model level, to avoid double-counting.
 */
import 'dotenv/config';
import { DosageReactGraphFactory } from '../src/infrastructure/services/agents/dosage_agent_react/graph/DosageReactGraph';
import { buildTracingCallbacks } from '../src/infrastructure/services/tracing/langfuse-tracer';

const factory = new DosageReactGraphFactory({
  threadId: 'studio',
  requireApproval: true,
});

const compiled = factory.buildWorkflow().compile();
const callbacks = buildTracingCallbacks();

export const graph = callbacks.length ? compiled.withConfig({ callbacks }) : compiled;
