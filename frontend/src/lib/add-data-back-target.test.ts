import { describe, expect, it } from 'vitest';
import { getAddDataBackTarget } from './add-data-back-target';

describe('getAddDataBackTarget', () => {
  it('maps a planning mode screen to the plan mode picker', () => {
    expect(getAddDataBackTarget({ type: 'plan', mode: 'manual' })).toEqual({
      to: '/add-data',
      search: { type: 'plan' },
    });
    expect(getAddDataBackTarget({ type: 'plan', mode: 'auto' })).toEqual({
      to: '/add-data',
      search: { type: 'plan' },
    });
  });

  it('maps a manual entity form to the manual landing', () => {
    expect(getAddDataBackTarget({ type: 'manual', entity: 'companies' })).toEqual({
      to: '/add-data',
      search: { type: 'manual' },
    });
  });

  it('maps first-level screens to the add-data landing', () => {
    expect(getAddDataBackTarget({ type: 'plan' })).toEqual({ to: '/add-data', search: {} });
    expect(getAddDataBackTarget({ type: 'manual' })).toEqual({ to: '/add-data', search: {} });
    expect(getAddDataBackTarget({ type: 'file' })).toEqual({ to: '/add-data', search: {} });
  });

  it('maps the add-data landing to home', () => {
    expect(getAddDataBackTarget({})).toEqual({ to: '/home' });
  });
});
