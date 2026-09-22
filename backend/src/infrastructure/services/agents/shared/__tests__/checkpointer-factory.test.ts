/**
 * Unit tests for the shared LangGraph checkpointer factory (PR-G of P2).
 * The factory must:
 *   1. Default to MemorySaver in NODE_ENV=test (so unit/integration FAST
 *      tests do not require a live Postgres).
 *   2. Honour LANGGRAPH_CHECKPOINTER_MODE=memory outside production.
 *   3. Throw when mode=postgres is requested without a connection string.
 *   4. Return a singleton PostgresSaver across calls — setup() runs once.
 */
// NOTE: we intentionally do not `import { MemorySaver }` here. The factory is
// re-imported inside `jest.isolateModules` (to reset the singleton) which
// gives it a fresh copy of `@langchain/langgraph` in a different module realm
// — `instanceof` checks across realms always fail. Identifying the class by
// `constructor.name` works regardless of realm.

const mockSetup = jest.fn().mockResolvedValue(undefined);
const mockFromConnString = jest.fn();

jest.mock('@langchain/langgraph-checkpoint-postgres', () => ({
  PostgresSaver: {
    fromConnString: (...args: unknown[]) => mockFromConnString(...args),
  },
}));

const ORIGINAL_ENV = { ...process.env };

function resetEnv(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }
  Object.assign(process.env, ORIGINAL_ENV);
}

/**
 * The factory caches the PostgresSaver in a module-level singleton, so each
 * test needs a fresh module instance to assert on creation behaviour.
 */
async function importFresh() {
  let mod: typeof import('../checkpointer-factory') = await import('../checkpointer-factory');
  jest.isolateModules(() => {
    mod = require('../checkpointer-factory');
  });
  return mod;
}

describe('createLangGraphCheckpointer (PR-G)', () => {
  beforeEach(() => {
    mockSetup.mockClear();
    mockFromConnString.mockReset();
    mockFromConnString.mockImplementation(() => ({ setup: mockSetup }));
    resetEnv();
  });

  afterAll(() => {
    resetEnv();
  });

  it('returns a MemorySaver by default when NODE_ENV=test', async () => {
    process.env.NODE_ENV = 'test';
    delete process.env.LANGGRAPH_CHECKPOINTER_MODE;
    delete process.env.LANGGRAPH_CHECKPOINTER_URL;

    const { createLangGraphCheckpointer } = await importFresh();
    const cp = await createLangGraphCheckpointer();

    expect(cp.constructor.name).toBe('MemorySaver');
    expect(mockFromConnString).not.toHaveBeenCalled();
  });

  it('returns a MemorySaver when LANGGRAPH_CHECKPOINTER_MODE=memory outside production', async () => {
    process.env.NODE_ENV = 'development';
    process.env.LANGGRAPH_CHECKPOINTER_MODE = 'memory';
    process.env.DATABASE_URL = 'postgres://test/url';

    const { createLangGraphCheckpointer } = await importFresh();
    const cp = await createLangGraphCheckpointer();

    expect(cp.constructor.name).toBe('MemorySaver');
    expect(mockFromConnString).not.toHaveBeenCalled();
  });

  it('throws when LANGGRAPH_CHECKPOINTER_MODE=postgres but no DATABASE_URL', async () => {
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = 'production';
    env.LANGGRAPH_CHECKPOINTER_MODE = 'postgres';
    delete env.DATABASE_URL;
    delete env.LANGGRAPH_CHECKPOINTER_URL;

    const { createLangGraphCheckpointer } = await importFresh();

    await expect(createLangGraphCheckpointer()).rejects.toThrow(
      /Postgres checkpointer requested without a connection string|Missing LANGGRAPH_CHECKPOINTER_URL/,
    );
  });

  it('builds a singleton PostgresSaver — setup() runs exactly once across calls', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LANGGRAPH_CHECKPOINTER_MODE = 'postgres';
    process.env.DATABASE_URL = 'postgres://test/url';

    const { createLangGraphCheckpointer } = await importFresh();
    const first = await createLangGraphCheckpointer();
    const second = await createLangGraphCheckpointer();
    const third = await createLangGraphCheckpointer();

    expect(first).toBe(second);
    expect(second).toBe(third);
    expect(mockFromConnString).toHaveBeenCalledTimes(1);
    expect(mockSetup).toHaveBeenCalledTimes(1);
  });
});
