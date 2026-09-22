/**
 * Unit tests for the pendingAction reducer on the field_note_agent graph
 * (PR-E of P2). Mirrors the parent test in
 * `dosage_agent_react/__tests__/pending-action-clear.test.ts`.
 *
 * The reducer must treat `null` as the explicit clear sentinel and
 * `undefined` as the no-op marker so that unrelated state updates do not
 * accidentally wipe an in-flight approval.
 */
import { pendingActionReducer } from '../graph';
import type { PendingFieldNoteAction } from '../types';

const samplePending: PendingFieldNoteAction = {
  tool: 'save_field_note',
  args: { rawContent: 'ho dato 5kg di rame' },
  description: 'Esecuzione save_field_note',
  requiresApproval: true,
  riskLevel: 'medium',
};

describe('pendingActionReducer (field_note_agent)', () => {
  it('keeps previous value when next is undefined (no-op update)', () => {
    expect(pendingActionReducer(samplePending, undefined)).toEqual(samplePending);
  });

  it('replaces previous value when next is a new PendingFieldNoteAction', () => {
    const newer: PendingFieldNoteAction = { ...samplePending, tool: 'save_stock_in_purchase' };
    expect(pendingActionReducer(samplePending, newer)).toEqual(newer);
  });

  it('returns undefined when next is null (explicit clear sentinel)', () => {
    expect(pendingActionReducer(samplePending, null)).toBeUndefined();
  });

  it('returns undefined when both prev and next are undefined', () => {
    expect(pendingActionReducer(undefined, undefined)).toBeUndefined();
  });

  it('clears even when prev is already undefined', () => {
    expect(pendingActionReducer(undefined, null)).toBeUndefined();
  });
});
