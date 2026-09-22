import { DosageReactAnnotation } from '../graph/graph-state';
import type { DosageReactState } from '../type/state';

type PendingAction = NonNullable<DosageReactState['pendingAction']>;

function getPendingActionReducer(): (
  prev: PendingAction | null | undefined,
  next: PendingAction | null | undefined,
) => PendingAction | undefined {
  const spec = (
    DosageReactAnnotation as unknown as {
      spec: Record<string, { operator: (prev: unknown, next: unknown) => unknown }>;
    }
  ).spec;
  return spec.pendingAction.operator as unknown as (
    prev: PendingAction | null | undefined,
    next: PendingAction | null | undefined,
  ) => PendingAction | undefined;
}

const samplePending: PendingAction = {
  tool: 'create_company',
  args: { name: 'Acme' },
  description: 'Esecuzione create_company',
  requiresApproval: true,
  riskLevel: 'medium',
};

describe('pendingAction reducer', () => {
  const reducer = getPendingActionReducer();

  it('keeps previous value when next is undefined (no-op update)', () => {
    expect(reducer(samplePending, undefined)).toEqual(samplePending);
  });

  it('replaces previous value when next is a new PendingAction', () => {
    const newer: PendingAction = { ...samplePending, tool: 'create_fields' };
    expect(reducer(samplePending, newer)).toEqual(newer);
  });

  it('returns undefined when next is null (explicit clear sentinel)', () => {
    expect(reducer(samplePending, null)).toBeUndefined();
  });

  it('returns undefined when both prev and next are undefined', () => {
    expect(reducer(undefined, undefined)).toBeUndefined();
  });

  it('clears even when prev is already undefined', () => {
    expect(reducer(undefined, null)).toBeUndefined();
  });
});
