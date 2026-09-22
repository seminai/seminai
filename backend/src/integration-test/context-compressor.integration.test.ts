import { createTestUser, deleteAllAgentMemories, prisma, type ITestUser } from './helpers';
import { ContextCompressor } from '../infrastructure/services/agents/dosage_agent_react/memory/context-compressor';
import { SystemMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { AgentMemoryType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

describe('ContextCompressor integration', () => {
  let testUser: ITestUser;

  beforeAll(async () => {
    testUser = await createTestUser();
  });

  afterEach(async () => {
    await deleteAllAgentMemories(testUser.id);
  });

  it('countTokens: returns > 0 and roughly content.length/4 for 50 messages', () => {
    const inputMessages = Array.from({ length: 50 }, (_, i) =>
      i % 2 === 0 ? new HumanMessage(`User question ${i}`) : new AIMessage(`Assistant reply ${i}`),
    );
    const compressor = new ContextCompressor();
    const actualTokens = compressor.countTokens(inputMessages);
    const totalChars = inputMessages.reduce((sum, m) => sum + String(m.content).length, 0);
    const expectedApprox = Math.ceil(totalChars / 4);
    expect(actualTokens).toBeGreaterThan(0);
    expect(actualTokens).toBe(expectedApprox);
  });

  it('shouldCompress returns false below threshold', () => {
    const inputMessages = [new HumanMessage('Hi'), new AIMessage('Hello'), new HumanMessage('Bye')];
    const compressor = new ContextCompressor();
    const actual = compressor.shouldCompress(inputMessages);
    expect(actual).toBe(false);
  });

  it('shouldCompress returns true above threshold', () => {
    const inputContent = 'x'.repeat(300);
    const inputMessages = Array.from({ length: 5 }, () => new HumanMessage(inputContent));
    const compressor = new ContextCompressor(100, 0.7, 5);
    const actual = compressor.shouldCompress(inputMessages);
    expect(actual).toBe(true);
  });

  it('compress preserves system message and recent messages', async () => {
    const systemContent = 'You are a helpful assistant.';
    const inputMessages = [
      new SystemMessage(systemContent),
      ...Array.from({ length: 20 }, (_, i) => new HumanMessage(`Filler message ${i}`)),
      new HumanMessage('Last 1'),
      new AIMessage('Last 2'),
      new HumanMessage('Last 3'),
      new AIMessage('Last 4'),
      new HumanMessage('Last 5'),
    ];
    const compressor = new ContextCompressor();
    const actual = await compressor.compress(inputMessages);
    expect(actual[0]).toBeInstanceOf(SystemMessage);
    expect((actual[0] as SystemMessage).content).toBe(systemContent);
    const lastFive = actual.slice(-5);
    expect(lastFive.map((m) => (m as HumanMessage | AIMessage).content)).toEqual([
      'Last 1',
      'Last 2',
      'Last 3',
      'Last 4',
      'Last 5',
    ]);
  });

  it('compress saves to AgentMemory as EPISODIC', async () => {
    const inputThreadId = uuidv4();
    const inputMessages = [
      new SystemMessage('System'),
      ...Array.from({ length: 15 }, (_, i) => new HumanMessage(`Msg ${i}`)),
      new HumanMessage('A'),
      new AIMessage('B'),
      new HumanMessage('C'),
      new AIMessage('D'),
      new HumanMessage('E'),
    ];
    const compressor = new ContextCompressor();
    await compressor.compress(inputMessages, {
      userId: testUser.id,
      threadId: inputThreadId,
    });
    const actual = await prisma.agentMemory.findMany({
      where: { userId: testUser.id, type: AgentMemoryType.EPISODIC },
    });
    const expectedKey = `dosage_compress_${inputThreadId}`;
    const episodicEntry = actual.find((m) => m.key === expectedKey);
    expect(episodicEntry).toBeDefined();
    expect(episodicEntry!.type).toBe(AgentMemoryType.EPISODIC);
  });

  it('compress preserves critical messages (keepRecentCount)', async () => {
    const keepRecentCount = 5;
    const inputMessages = [
      new SystemMessage('Sys'),
      ...Array.from({ length: 20 }, (_, i) => new HumanMessage(`Filler ${i}`)),
      new HumanMessage('Critical 1'),
      new AIMessage('Critical 2'),
      new HumanMessage('Critical 3'),
      new AIMessage('Critical 4'),
      new HumanMessage('Critical 5'),
    ];
    const compressor = new ContextCompressor(128_000, 0.7, keepRecentCount);
    const actual = await compressor.compress(inputMessages);
    const lastPart = actual.slice(-keepRecentCount);
    const expectedContent = ['Critical 1', 'Critical 2', 'Critical 3', 'Critical 4', 'Critical 5'];
    expect(lastPart.length).toBe(keepRecentCount);
    expect(lastPart.map((m) => (m as HumanMessage | AIMessage).content)).toEqual(expectedContent);
  });
});
