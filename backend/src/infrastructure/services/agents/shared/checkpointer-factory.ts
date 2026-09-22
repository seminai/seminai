import { BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph';
import { PostgresSaver } from '@langchain/langgraph-checkpoint-postgres';

type CheckpointerMode = 'auto' | 'memory' | 'postgres';

const DEFAULT_CHECKPOINTER_MODE: CheckpointerMode = 'auto';

let postgresSaverPromise: Promise<PostgresSaver> | null = null;

function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === 'production';
}

function resolveCheckpointerMode(): CheckpointerMode {
  const rawMode = process.env.LANGGRAPH_CHECKPOINTER_MODE?.toLowerCase();
  if (rawMode === 'memory' || rawMode === 'postgres' || rawMode === 'auto') {
    return rawMode;
  }
  if (process.env.NODE_ENV === 'test') {
    return 'memory';
  }
  return DEFAULT_CHECKPOINTER_MODE;
}

function resolveConnectionString(): string | undefined {
  return process.env.LANGGRAPH_CHECKPOINTER_URL ?? process.env.DATABASE_URL;
}

async function createPostgresSaver(): Promise<PostgresSaver> {
  if (postgresSaverPromise) {
    return postgresSaverPromise;
  }
  const connectionString = resolveConnectionString();
  if (!connectionString) {
    throw new Error('Missing LANGGRAPH_CHECKPOINTER_URL or DATABASE_URL for PostgresSaver');
  }
  const schema = process.env.LANGGRAPH_CHECKPOINTER_SCHEMA;
  postgresSaverPromise = (async () => {
    const saver = PostgresSaver.fromConnString(connectionString, schema ? { schema } : undefined);
    await saver.setup();
    return saver;
  })();
  return postgresSaverPromise;
}

/**
 * Creates the LangGraph checkpointer shared across sub-agents (dosage react,
 * field note, future ones). Production requires Postgres so conversations do
 * not degrade to volatile per-instance memory.
 *
 * The PostgresSaver instance is a process-wide singleton — the underlying
 * tables are created idempotently by `.setup()` on first invocation, and
 * subsequent calls reuse the same connection. Thread namespaces stay isolated
 * by callers (e.g. field_note uses `${parentThreadId}-fieldnote`).
 */
export async function createLangGraphCheckpointer(): Promise<BaseCheckpointSaver> {
  const mode = resolveCheckpointerMode();
  if (mode === 'memory') {
    if (isProductionRuntime()) {
      throw new Error('MemorySaver checkpointer is not allowed in production');
    }
    return new MemorySaver();
  }
  try {
    const connectionString = resolveConnectionString();
    if (!connectionString) {
      if (mode === 'postgres' || isProductionRuntime()) {
        throw new Error('Postgres checkpointer requested without a connection string');
      }
      return new MemorySaver();
    }
    return await createPostgresSaver();
  } catch (error) {
    if (mode === 'postgres' || isProductionRuntime()) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[LangGraph] Postgres checkpointer unavailable: ${message}`);
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.warn(`[LangGraph] Falling back to MemorySaver: ${message}`);
    return new MemorySaver();
  }
}
