import { HumanMessage, AIMessage, SystemMessage, ToolMessage } from '@langchain/core/messages';
import {
  ContextCompressor,
  summarizeOldToolResults,
  extractAllUuids,
} from '../memory/context-compressor';

// ContextCompressor accepts a memoryService via constructor injection,
// so we can pass a mock without jest.mock/bun mock.module.
const mockMemoryService = {
  saveEpisodicMemory: async () => undefined,
} as unknown as ConstructorParameters<typeof ContextCompressor>[3];

describe('ContextCompressor', () => {
  describe('countTokens', () => {
    it('estimates tokens from message content', () => {
      const compressor = new ContextCompressor(128000, 0.7, 5, mockMemoryService);
      const messages = [
        new HumanMessage('Hello world'), // 11 chars ≈ 3 tokens
      ];
      const tokens = compressor.countTokens(messages);
      expect(tokens).toBe(Math.ceil(11 / 4));
    });

    it('handles empty messages', () => {
      const compressor = new ContextCompressor(128000, 0.7, 5, mockMemoryService);
      expect(compressor.countTokens([])).toBe(0);
    });
  });

  describe('shouldCompress', () => {
    it('returns false when under threshold', () => {
      const compressor = new ContextCompressor(1000, 0.7, 5, mockMemoryService);
      const messages = [new HumanMessage('short message')];
      expect(compressor.shouldCompress(messages)).toBe(false);
    });

    it('returns true when over threshold', () => {
      // Context limit = 100 tokens, threshold = 0.7 → compress at 70 tokens
      // 70 tokens ≈ 280 chars
      const compressor = new ContextCompressor(100, 0.7, 5, mockMemoryService);
      const longMsg = 'x'.repeat(300); // 300 chars ≈ 75 tokens
      const messages = [new HumanMessage(longMsg)];
      expect(compressor.shouldCompress(messages)).toBe(true);
    });
  });

  describe('compress', () => {
    it('returns unchanged if messages <= keepRecentCount + 1', async () => {
      const compressor = new ContextCompressor(128000, 0.7, 5, mockMemoryService);
      const messages = [
        new SystemMessage('system'),
        new HumanMessage('hello'),
        new AIMessage('hi'),
      ];
      const result = await compressor.compress(messages);
      expect(result).toEqual(messages);
    });

    it('preserves first system message and last N messages', async () => {
      const compressor = new ContextCompressor(128000, 0.7, 2, mockMemoryService);
      const messages = [
        new SystemMessage('system prompt'),
        new HumanMessage('msg 1'),
        new AIMessage('reply 1'),
        new HumanMessage('msg 2'),
        new AIMessage('reply 2'),
        new HumanMessage('msg 3'),
        new AIMessage('reply 3'),
      ];
      const result = await compressor.compress(messages);
      // Should have: system + summary + last 2 messages
      expect(result).toHaveLength(4); // system + summary + msg3 + reply3
      expect(result[0]).toBeInstanceOf(SystemMessage);
      expect((result[0] as SystemMessage).content).toBe('system prompt');
      expect(result[1]).toBeInstanceOf(SystemMessage);
      expect((result[1] as SystemMessage).content).toContain('Compressed context');
    });

    it('includes tool names in summary', async () => {
      const compressor = new ContextCompressor(128000, 0.7, 1, mockMemoryService);
      const messages = [
        new SystemMessage('system'),
        new ToolMessage({
          content: JSON.stringify({ result: 'products found' }),
          tool_call_id: 'call_1',
          name: 'search_products',
        }),
        new ToolMessage({
          content: JSON.stringify({ result: 'dosage calculated' }),
          tool_call_id: 'call_2',
          name: 'calculate_dosage',
        }),
        new AIMessage('final response'),
      ];
      const result = await compressor.compress(messages);
      const summaryMsg = result[1] as SystemMessage;
      const summaryContent = summaryMsg.content as string;
      expect(summaryContent).toContain('search_products');
      expect(summaryContent).toContain('calculate_dosage');
    });

    it('extracts user decisions in summary', async () => {
      const compressor = new ContextCompressor(128000, 0.7, 1, mockMemoryService);
      const messages = [
        new SystemMessage('system'),
        new HumanMessage('sì procedi con il piano'),
        new AIMessage('ok'),
        new AIMessage('final'),
      ];
      const result = await compressor.compress(messages);
      const summaryContent = (result[1] as SystemMessage).content as string;
      expect(summaryContent).toContain('Decisione utente');
      expect(summaryContent).toContain('approvazione');
    });

    it('handles middle with no tool messages', async () => {
      const compressor = new ContextCompressor(128000, 0.7, 1, mockMemoryService);
      const messages = [
        new SystemMessage('system'),
        new HumanMessage('msg 1'),
        new AIMessage('reply 1'),
        new HumanMessage('msg 2'),
        new AIMessage('reply 2'),
      ];
      const result = await compressor.compress(messages);
      const summaryMsg = result[1] as SystemMessage;
      expect(summaryMsg.content as string).toContain('compressed');
    });
  });
});

describe('summarizeOldToolResults', () => {
  const longPayload = 'x'.repeat(1000);
  const shortPayload = JSON.stringify({ ok: true });

  function makeToolMessage(name: string, content: string, idSuffix: string): ToolMessage {
    return new ToolMessage({
      id: `tool-${idSuffix}`,
      content,
      tool_call_id: `call-${idSuffix}`,
      name,
    });
  }

  it('returns the same array when there are no extra turns to compress', () => {
    const messages = [
      new SystemMessage('system'),
      new HumanMessage('first'),
      makeToolMessage('search_products', longPayload, '1'),
      new AIMessage('done'),
    ];
    const result = summarizeOldToolResults(messages, 6);
    expect(result).toBe(messages);
  });

  it('keeps the last N turns at full fidelity and shrinks older tool payloads', () => {
    const messages = [
      new SystemMessage('system'),
      new HumanMessage('turn 1'),
      makeToolMessage('search_products', longPayload, '1'),
      new AIMessage('ai 1'),
      new HumanMessage('turn 2'),
      makeToolMessage('calculate_dosage', longPayload, '2'),
      new AIMessage('ai 2'),
      new HumanMessage('turn 3'),
      makeToolMessage('generate_treatment_plan', longPayload, '3'),
      new AIMessage('ai 3'),
    ];
    const result = summarizeOldToolResults(messages, 1);
    expect(result).not.toBe(messages);
    expect(result).toHaveLength(messages.length);
    // Old tool messages get compressed
    const oldTool1 = result[2] as ToolMessage;
    const oldTool2 = result[5] as ToolMessage;
    expect(oldTool1.content as string).toMatch(/^\[summary\] search_products/);
    expect(oldTool2.content as string).toMatch(/^\[summary\] calculate_dosage/);
    // ID and tool_call_id preserved for reducer dedupe + tool-call pairing
    expect(oldTool1.id).toBe('tool-1');
    expect(oldTool1.tool_call_id).toBe('call-1');
    // Last turn untouched (full fidelity)
    expect(result[8]).toBe(messages[8]);
    expect((result[8] as ToolMessage).content as string).toBe(longPayload);
  });

  it('does not touch short tool payloads', () => {
    const messages = [
      new HumanMessage('turn 1'),
      makeToolMessage('search_products', shortPayload, '1'),
      new AIMessage('ai 1'),
      new HumanMessage('turn 2'),
      new AIMessage('ai 2'),
      new HumanMessage('turn 3'),
      new AIMessage('ai 3'),
    ];
    const result = summarizeOldToolResults(messages, 1);
    expect(result[1]).toBe(messages[1]);
  });

  it('leaves Human/AI messages untouched even when older than the window', () => {
    const messages = [
      new HumanMessage('older human ' + longPayload),
      new AIMessage('older ai ' + longPayload),
      new HumanMessage('recent'),
      new AIMessage('recent reply'),
    ];
    const result = summarizeOldToolResults(messages, 1);
    expect(result[0]).toBe(messages[0]);
    expect(result[1]).toBe(messages[1]);
  });

  it('handles empty input and degenerate recentTurnsToKeep', () => {
    expect(summarizeOldToolResults([], 6)).toEqual([]);
    const messages = [new HumanMessage('hi')];
    expect(summarizeOldToolResults(messages, 0)).toBe(messages);
  });

  // ── PR-I: UUID preservation + bumped cutoff ──

  it('extractAllUuids: dedupes and lowercases UUIDs from a mixed string', () => {
    const text = `prefix B136F881-1111-2222-3333-444455556666 middle b136f881-1111-2222-3333-444455556666 end abc12345-6789-4abc-def0-1234567890ab`;
    expect(extractAllUuids(text)).toEqual([
      'b136f881-1111-2222-3333-444455556666',
      'abc12345-6789-4abc-def0-1234567890ab',
    ]);
  });

  it('summarizeOldToolResults: includes [ids: ...] tag for UUIDs hidden past the truncation cutoff', () => {
    const hiddenUuid = 'b136f881-1111-2222-3333-444455556666';
    const padding = 'x'.repeat(800); // > TOOL_SUMMARY_MAX_CHARS (400)
    const payload = `${padding}${hiddenUuid}`;
    const messages = [
      new HumanMessage('turn 1'),
      makeToolMessage('create_jobs', payload, '1'),
      new AIMessage('ai 1'),
      new HumanMessage('turn 2'),
      new AIMessage('recent'),
    ];
    const result = summarizeOldToolResults(messages, 1);
    const compressed = result[1] as ToolMessage;
    const content = compressed.content as string;
    expect(content).toMatch(/^\[summary\] create_jobs/);
    expect(content).toContain(`[ids: ${hiddenUuid}]`);
    // The UUID itself is past the cutoff, so the snippet must NOT contain it.
    const beforeIdsTag = content.split('[ids:')[0];
    expect(beforeIdsTag).not.toContain(hiddenUuid);
  });

  it('summarizeOldToolResults: omits the [ids: ...] tag when no UUID is present', () => {
    const noUuidPayload = JSON.stringify({ status: 'ok', message: 'x'.repeat(500) });
    const messages = [
      new HumanMessage('turn 1'),
      makeToolMessage('search_products', noUuidPayload, '1'),
      new AIMessage('ai 1'),
      new HumanMessage('turn 2'),
      new AIMessage('recent'),
    ];
    const result = summarizeOldToolResults(messages, 1);
    const content = (result[1] as ToolMessage).content as string;
    expect(content).not.toContain('[ids:');
  });

  it('summarizeOldToolResults: payloads under 400 chars pass unchanged (bumped cutoff)', () => {
    const mediumPayload = JSON.stringify({ ok: true, data: 'a'.repeat(300) }); // < 400 chars
    const messages = [
      new HumanMessage('turn 1'),
      makeToolMessage('list_user_companies', mediumPayload, '1'),
      new AIMessage('ai 1'),
      new HumanMessage('turn 2'),
      new AIMessage('recent'),
    ];
    const result = summarizeOldToolResults(messages, 1);
    expect(result[1]).toBe(messages[1]); // untouched — under the new 400 cutoff
  });

  it('ContextCompressor.compress: surfaces all new entity ids in Important Facts', async () => {
    const compressor = new ContextCompressor(128000, 0.7, 1, mockMemoryService);
    const messages = [
      new SystemMessage('system'),
      new ToolMessage({
        content: JSON.stringify({
          jobId: 'job-abc-123',
          ruleId: 'rule-xyz-456',
          fieldNoteId: 'note-789',
          stockMovementId: 'stock-mov-555',
        }),
        tool_call_id: 'call_1',
        name: 'create_jobs',
      }),
      new AIMessage('final response'),
    ];
    const result = await compressor.compress(messages);
    const summary = (result[1] as SystemMessage).content as string;
    expect(summary).toContain('Job creato: job-abc-123');
    expect(summary).toContain('Regola creata: rule-xyz-456');
    expect(summary).toContain('Nota di campo creata: note-789');
    expect(summary).toContain('Movimento magazzino creato: stock-mov-555');
  });
});
