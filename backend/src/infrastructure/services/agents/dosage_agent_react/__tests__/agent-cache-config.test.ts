import { AgentCacheConfig, canReuseCachedAgentConfig } from '../agent-cache-config';

function makeConfig(overrides: Partial<AgentCacheConfig> = {}): AgentCacheConfig {
  return {
    userId: 'user-1',
    jobId: 'job-1',
    workspaceId: 'workspace-1',
    modelName: 'gpt-4o-mini',
    temperature: 0,
    skipRAG: false,
    skipDisciplinariPdf: false,
    requireApproval: true,
    toolBundle: 'DOSAGE',
    formMode: undefined,
    provider: 'openai',
    modelRoutingFingerprint: JSON.stringify({
      provider: 'openai',
      low: 'gpt-4o-mini',
      medium: 'gpt-4o',
      high: 'gpt-4o',
    }),
    capabilityFingerprint: JSON.stringify({
      hasJobOperationsRag: false,
      hasDisciplinariPdf: false,
      hasTavily: false,
    }),
    ...overrides,
  };
}

describe('canReuseCachedAgentConfig', () => {
  it('reuses compatible configs', () => {
    const cachedConfig = makeConfig();
    const requestedConfig = makeConfig();
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(true);
  });

  it('does not reuse graphs with different approval mode', () => {
    const cachedConfig = makeConfig({ requireApproval: true });
    const requestedConfig = makeConfig({ requireApproval: false });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('does not reuse graphs with different tool bundle', () => {
    const cachedConfig = makeConfig({ toolBundle: 'DOSAGE' });
    const requestedConfig = makeConfig({ toolBundle: 'FULL' });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('does not reuse graphs when formMode toggles on', () => {
    const cachedConfig = makeConfig({ formMode: undefined });
    const requestedConfig = makeConfig({ formMode: 'production_units' });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('does not reuse graphs when formMode toggles off', () => {
    const cachedConfig = makeConfig({ formMode: 'production_units' });
    const requestedConfig = makeConfig({ formMode: undefined });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('does not reuse graphs when provider changes', () => {
    const cachedConfig = makeConfig({ provider: 'openai' });
    const requestedConfig = makeConfig({ provider: 'claude' });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('does not reuse graphs when model routing fingerprint changes', () => {
    const cachedConfig = makeConfig({
      modelRoutingFingerprint: JSON.stringify({
        provider: 'openrouter',
        low: 'openai/gpt-4o-mini',
        medium: 'openai/gpt-4o-mini',
        high: 'openai/gpt-4o',
      }),
    });
    const requestedConfig = makeConfig({
      modelRoutingFingerprint: JSON.stringify({
        provider: 'openrouter',
        low: 'openai/gpt-4o-mini',
        medium: 'openai/gpt-4o',
        high: 'openai/gpt-4o',
      }),
    });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('does not reuse graphs when capability fingerprint differs', () => {
    const cachedFingerprint = JSON.stringify({
      hasJobOperationsRag: false,
      hasDisciplinariPdf: false,
      hasTavily: false,
    });
    const requestedFingerprint = JSON.stringify({
      hasJobOperationsRag: true,
      hasDisciplinariPdf: false,
      hasTavily: false,
    });
    const cachedConfig = makeConfig({ capabilityFingerprint: cachedFingerprint });
    const requestedConfig = makeConfig({ capabilityFingerprint: requestedFingerprint });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(false);
  });

  it('reuses when only optional jobId/workspaceId in requested is absent', () => {
    const cachedConfig = makeConfig({ jobId: 'job-1', workspaceId: 'workspace-1' });
    const requestedConfig = makeConfig({ jobId: undefined, workspaceId: undefined });
    expect(canReuseCachedAgentConfig(cachedConfig, requestedConfig)).toBe(true);
  });
});
