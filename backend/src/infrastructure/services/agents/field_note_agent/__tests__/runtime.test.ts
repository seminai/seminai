import {
  createFieldNoteRunConfig,
  detectFieldNoteToolLoop,
  FIELD_NOTE_RUNTIME_LIMITS,
} from '../runtime';

describe('field note runtime safeguards', () => {
  it('passes an explicit LangGraph recursion limit', () => {
    expect(createFieldNoteRunConfig('thread-1')).toEqual({
      configurable: { thread_id: 'thread-1' },
      recursionLimit: FIELD_NOTE_RUNTIME_LIMITS.RECURSION_LIMIT,
    });
  });

  it('detects repeated tool calls before the recursion limit is reached', () => {
    expect(detectFieldNoteToolLoop(Array(5).fill('find_user_products'))).toBe('pattern');
  });

  it('keeps detecting alternating and period-3 patterns', () => {
    expect(detectFieldNoteToolLoop(['a', 'b', 'a', 'b', 'a', 'b'])).toBe('pattern');
    expect(detectFieldNoteToolLoop(['a', 'b', 'c', 'a', 'b', 'c'])).toBe('pattern');
  });
});
