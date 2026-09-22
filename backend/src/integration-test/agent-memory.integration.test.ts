import { createTestUser, deleteAllAgentMemories, prisma, type ITestUser } from './helpers';
import { AgentMemoryService } from '../infrastructure/services/agents/dosage_agent_react/memory/agent-memory.service';
import { AgentMemoryType } from '@prisma/client';

describe('AgentMemoryService integration', () => {
  let testUser: ITestUser;
  const memoryService = new AgentMemoryService();

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterEach(async () => {
    await deleteAllAgentMemories(testUser.id);
  });

  it('CRUD AgentMemory CORE: save and retrieve via findByKey', async () => {
    const inputKey = 'prefs:locale';
    const inputContent = { locale: 'it-IT' };
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.CORE,
      key: inputKey,
      content: inputContent,
    });
    const actual = await memoryService.findByKey(testUser.id, AgentMemoryType.CORE, inputKey);
    expect(actual).not.toBeNull();
    expect(actual!.key).toBe(inputKey);
    expect(actual!.type).toBe(AgentMemoryType.CORE);
    expect(actual!.content).toEqual(inputContent);
  });

  it('CRUD AgentMemory EPISODIC: save and read by userId+type', async () => {
    const inputKey = 'session:2025-03-01';
    const inputContent = { summary: 'Session about fertilizer dosage' };
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.EPISODIC,
      key: inputKey,
      content: inputContent,
    });
    const actual = await memoryService.loadByType(testUser.id, AgentMemoryType.EPISODIC);
    const expected = inputContent;
    expect(actual.length).toBe(1);
    expect(actual[0].content).toEqual(expected);
  });

  it('CRUD AgentMemory PROCEDURAL: save and read by key', async () => {
    const inputKey = 'workflow:dose-calc';
    const inputContent = { steps: ['fetch-rule', 'compute-dose'] };
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.PROCEDURAL,
      key: inputKey,
      content: inputContent,
    });
    const actual = await memoryService.findByKey(testUser.id, AgentMemoryType.PROCEDURAL, inputKey);
    expect(actual).not.toBeNull();
    expect(actual!.content).toEqual(inputContent);
  });

  it('CRUD AgentMemory SEMANTIC: verify type filtering', async () => {
    const inputKey = 'knowledge:urea-formula';
    const inputContent = { formula: 'CO(NH2)2' };
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.SEMANTIC,
      key: inputKey,
      content: inputContent,
    });
    const actual = await memoryService.loadByType(testUser.id, AgentMemoryType.SEMANTIC);
    expect(actual.length).toBe(1);
    expect(actual[0].type).toBe(AgentMemoryType.SEMANTIC);
    expect(actual[0].content).toEqual(inputContent);
  });

  it('saveEpisodicMemory: saves session summary with correct type and content', async () => {
    const inputSessionKey = 'session:2025-03-06';
    const inputSummary = { actions: ['dose-calc', 'rule-lookup'] };
    await memoryService.saveEpisodicMemory(testUser.id, inputSessionKey, inputSummary);
    const actual = await memoryService.findByKey(
      testUser.id,
      AgentMemoryType.EPISODIC,
      inputSessionKey,
    );
    expect(actual).not.toBeNull();
    expect(actual!.type).toBe(AgentMemoryType.EPISODIC);
    expect(actual!.content).toEqual(inputSummary);
  });

  it('loadRelevantMemories: returns memories ordered by importance desc', async () => {
    const episodics = [1, 2, 3, 4, 5].map((i) =>
      memoryService.save({
        userId: testUser.id,
        type: AgentMemoryType.EPISODIC,
        key: `ep:${i}`,
        content: { n: i },
        importance: i * 0.5,
      }),
    );
    const cores = [1, 2].map((i) =>
      memoryService.save({
        userId: testUser.id,
        type: AgentMemoryType.CORE,
        key: `core:${i}`,
        content: { n: i },
        importance: i * 2,
      }),
    );
    await Promise.all([...episodics, ...cores]);
    const actual = await memoryService.loadRelevantMemories(testUser.id, {
      limit: 10,
    });
    const importances = actual.map((m) => m.importance);
    const expected = [...importances].sort((a, b) => b - a);
    expect(importances).toEqual(expected);
  });

  it('saveProcedural: workflow key workflow:scarico:vite is retrievable', async () => {
    const inputKey = 'workflow:scarico:vite';
    const inputSteps = { steps: ['load', 'mix', 'apply'] };
    await memoryService.saveProcedural(testUser.id, inputKey, inputSteps);
    const actual = await memoryService.findByKey(testUser.id, AgentMemoryType.PROCEDURAL, inputKey);
    expect(actual).not.toBeNull();
    expect(actual!.key).toBe(inputKey);
    expect(actual!.content).toEqual(inputSteps);
  });

  it('loadCoreMemory: returns only CORE type memories', async () => {
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.CORE,
      key: 'core:only',
      content: {},
    });
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.EPISODIC,
      key: 'ep:other',
      content: {},
    });
    const actual = await memoryService.loadCoreMemory(testUser.id);
    expect(actual.every((m) => m.type === AgentMemoryType.CORE)).toBe(true);
    expect(actual.length).toBe(1);
  });

  it('Deduplication (upsert): same key+userId+type results in single record with updated content', async () => {
    const inputKey = 'upsert:test';
    const inputContent1 = { v: 1 };
    const inputContent2 = { v: 2 };
    const saved1 = await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.CORE,
      key: inputKey,
      content: inputContent1,
    });
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.CORE,
      key: inputKey,
      content: inputContent2,
    });
    const count = await prisma.agentMemory.count({
      where: { userId: testUser.id, type: AgentMemoryType.CORE, key: inputKey },
    });
    expect(count).toBe(1);
    const actual = await memoryService.findByKey(testUser.id, AgentMemoryType.CORE, inputKey);
    expect(actual!.content).toEqual(inputContent2);
    expect(actual!.id).toBe(saved1.id);
  });

  it('TTL: memory with expiresAt in past is excluded from loadRelevantMemories', async () => {
    const pastExpiry = new Date(Date.now() - 86400000);
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.EPISODIC,
      key: 'expired',
      content: {},
      expiresAt: pastExpiry,
    });
    await memoryService.save({
      userId: testUser.id,
      type: AgentMemoryType.EPISODIC,
      key: 'valid',
      content: {},
    });
    const actual = await memoryService.loadRelevantMemories(testUser.id);
    expect(actual.length).toBe(1);
    expect(actual[0].key).toBe('valid');
  });
});
