import { describe, expect, it } from 'vitest';
import { getManualLandingGridClass, isCompactCardLayout } from './manual-add-grid';

describe('getManualLandingGridClass', () => {
  it('keeps the 3-column layout for manufacturing workspaces (3 cards)', () => {
    expect(getManualLandingGridClass(3)).toBe(
      'grid w-full max-w-3xl grid-cols-1 gap-6 sm:grid-cols-3',
    );
  });

  it('puts 5 cards on a single row at lg', () => {
    const cls = getManualLandingGridClass(5);
    expect(cls).toContain('lg:grid-cols-5');
    expect(cls).toContain('max-w-6xl');
  });
});

describe('isCompactCardLayout', () => {
  it('is compact only above 3 cards', () => {
    expect(isCompactCardLayout(3)).toBe(false);
    expect(isCompactCardLayout(5)).toBe(true);
  });
});
