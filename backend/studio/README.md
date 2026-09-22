# LangGraph Studio (local)

Visualize and run the LangGraph agents locally — graph topology, node-by-node
execution, state inspection and time-travel — without LangSmith Cloud or a paid
plan. The dev server is fully in-memory and runs on your machine.

## Run

```bash
npm run studio
```

This starts the local LangGraph API at `http://localhost:2024` and prints the
Studio UI URL:

```
https://smith.langchain.com/studio?baseUrl=http://localhost:2024
```

Open it in the browser. The Studio UI is just a frontend that talks to your
**local** dev server — your data, prompts and traces never leave the machine
(you only need a free LangSmith login to load the UI shell). To run threads you
need the LLM env vars in `.env` (`OPENROUTER_API_KEY` / the active
`LLM_GATEWAY` key); the graph topology renders even without them.

## What's wired

- [`langgraph.json`](../langgraph.json) — registers the graphs and points at `.env`.
- [`dosage-react.graph.ts`](./dosage-react.graph.ts) — Studio entrypoint for the
  Dosage ReAct agent. It reuses the **production** topology via
  `DosageReactGraphFactory.buildWorkflow()` and compiles it without a
  checkpointer, so the dev server injects its own in-memory persistence.

Graph: `__start__ → taskPlanner → agent → guard → {tools | approval_gate} →
{autoCritic | contextCompressor} → agent … → __end__`.

## Full traces, fully local (Langfuse)

LangGraph Studio's thread view shows graph **state** per node, not the raw LLM
prompt/response or tool I/O — and its frontend is served from
`smith.langchain.com`. For a **100% local UI** that captures **every LLM and
tool call** (full prompt + completion, tokens, latency, errors) as a nested
trace, point the agent at a self-hosted **Langfuse**.

How it's wired:

- [`../src/infrastructure/services/tracing/langfuse-tracer.ts`](../src/infrastructure/services/tracing/langfuse-tracer.ts)
  — `buildTracingCallbacks()`: env-gated, fail-safe. Sets up an **isolated**
  OpenTelemetry tracer provider with the Langfuse span processor
  (`exportMode: 'immediate'`) and returns the LangChain `CallbackHandler`.
- [`./dosage-react.graph.ts`](./dosage-react.graph.ts) — binds the handler via
  `compiled.withConfig({ callbacks })`. Config-level binding propagates to **all**
  nodes/LLM/tool runs (full nested trace). It is intentionally **not** bound at
  the model level, which would double-count generations.

Run it:

```bash
# 1. Start Langfuse locally (separate dir — do NOT merge into this project's compose)
git clone https://github.com/langfuse/langfuse.git
cd langfuse && docker compose up -d        # UI on http://localhost:3000

# 2. In the Langfuse UI: create org/project -> Settings -> API Keys -> copy pk-lf-... / sk-lf-...
# 3. Paste the keys into seminai-be-v2/.env (LANGFUSE_PUBLIC_KEY / LANGFUSE_SECRET_KEY).
#    LANGFUSE_TRACING=true and LANGFUSE_BASE_URL=http://localhost:3000 are already set.

# 4. Start Studio (env already enables tracing)
npm run studio
```

On startup the log shows `[TRACING] Langfuse enabled`. Run a thread in Studio
with a **real** question (not empty), then open `http://localhost:3000` →
**Traces**: one trace per run with the tree graph → `taskPlanner`/`agent`/`guard`/
`tools` → LLM generation (input messages, completion, token usage) and tool spans.

Notes:

- **Tool spans need a reachable DB.** Prisma-backed tools throw if `DATABASE_URL`
  is unreachable; make sure local Postgres is up. A pure-reasoning prompt still
  produces the LLM span without a DB.
- Tracing is **off** whenever `LANGFUSE_TRACING` ≠ `true` or the keys are blank —
  the agent runs untraced, never blocked.
- Scope is **Studio only**. Tracing the real backend (SSE `streaming.ts` / REST
  `DosageReactAgent.ts`) is a deliberate next step, not wired here.

## Version pin

The dev server (`@langchain/langgraph-cli` / `@langchain/langgraph-api`) is
pinned to **1.1.17** because newer 1.2.x builds require
`@langchain/langgraph >= 1.3.x` (they import `STREAM_EVENTS_V3_MODES`), while
this project is on `@langchain/langgraph@1.2.1`. When the core LangGraph is
bumped to 1.3.x, the CLI can be upgraded to the latest in lock-step.

## Adding another agent

The other StateGraph agents (`chat_dosage_agent`, `job_agent`,
`field_note_agent`) can be exposed the same way: extract a `buildWorkflow()`
from their factory, add a `studio/<name>.graph.ts` that exports
`factory.buildWorkflow().compile()`, then add an entry under `graphs` in
`langgraph.json`.
