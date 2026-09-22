/**
 * Unit tests for the unconditional FIELD_NOTE_SYSTEM_PROMPT prepend on the
 * field_note_agent (PR-F of P2). Mirrors the parent dosage_agent_react fix
 * (graph/nodes.ts:84-85). The key regression guard is the third test:
 * even if the history already starts with a SystemMessage (e.g. after Prisma
 * restore), the base prompt MUST still be prepended so the model never loses
 * domain constraints like "CAMPO OBBLIGATORIO".
 */
import { prependFieldNoteSystemPrompt } from '../graph';
import { FIELD_NOTE_SYSTEM_PROMPT } from '../prompts/fieldNoteSystemPrompt';
import { SystemMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';

describe('prependFieldNoteSystemPrompt (PR-F)', () => {
  it('prepends a SystemMessage with FIELD_NOTE_SYSTEM_PROMPT as the first element', () => {
    const result = prependFieldNoteSystemPrompt([new HumanMessage('hello')]);

    expect(result).toHaveLength(2);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[0].content).toBe(FIELD_NOTE_SYSTEM_PROMPT);
  });

  it('preserves the original message order after the prepended SystemMessage (post-interrupt resume shape)', () => {
    const original = [
      new HumanMessage('ho dato 5kg di rame'),
      new AIMessage({
        content: '',
        tool_calls: [{ name: 'save_field_note', args: {}, id: 'tc1' }],
      }),
      new ToolMessage({ content: '{"success":true}', tool_call_id: 'tc1' }),
    ];

    const result = prependFieldNoteSystemPrompt(original);

    expect(result).toHaveLength(4);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[0].content).toBe(FIELD_NOTE_SYSTEM_PROMPT);
    expect(result.slice(1)).toEqual(original);
  });

  it('prepends even when input already starts with a SystemMessage (no conditional skip)', () => {
    const stale = new SystemMessage('LEGACY OR COMPRESSED SYSTEM PROMPT');
    const conversation = [stale, new HumanMessage('continua dal salvataggio precedente')];

    const result = prependFieldNoteSystemPrompt(conversation);

    expect(result).toHaveLength(3);
    expect(result[0]).toBeInstanceOf(SystemMessage);
    expect(result[0].content).toBe(FIELD_NOTE_SYSTEM_PROMPT);
    // The stale system message is kept in place AFTER the fresh base prompt:
    // both reach the LLM, but the base prompt wins thanks to ordering.
    expect(result[1]).toBe(stale);
  });

  it('routes stock movement verbs to the correct save tools', () => {
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('save_stock_out_treatment');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('ho dato');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('ho applicato');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('ho distribuito');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('ho trattato');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('ho usato');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('NON chiamare mai save_stock_in_purchase');

    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('comprato/acquistato/ricevuto/caricato un prodotto');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('save_stock_in_purchase');

    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('venduto un prodotto');
    expect(FIELD_NOTE_SYSTEM_PROMPT).toContain('save_stock_out_sale');
  });
});
