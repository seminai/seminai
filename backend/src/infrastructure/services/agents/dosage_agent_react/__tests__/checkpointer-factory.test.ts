describe('createLangGraphCheckpointer', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    process.env = { ...originalEnv };
    process.env.DATABASE_URL = '';
    process.env.LANGGRAPH_CHECKPOINTER_URL = '';
    process.env.LANGGRAPH_CHECKPOINTER_MODE = '';
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = originalEnv;
  });

  it('rejects volatile memory checkpointer in production', async () => {
    process.env.NODE_ENV = 'production';
    process.env.LANGGRAPH_CHECKPOINTER_MODE = 'memory';
    const { createLangGraphCheckpointer } = await import('../../shared/checkpointer-factory');

    await expect(createLangGraphCheckpointer()).rejects.toThrow(
      'MemorySaver checkpointer is not allowed in production',
    );
  });

  it('requires a Postgres connection string in production auto mode', async () => {
    process.env.NODE_ENV = 'production';
    const { createLangGraphCheckpointer } = await import('../../shared/checkpointer-factory');

    await expect(createLangGraphCheckpointer()).rejects.toThrow(
      'Postgres checkpointer requested without a connection string',
    );
  });
});
