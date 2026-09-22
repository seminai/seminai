import { describe, expect, it } from 'vitest';
import { isManufacturingWorkspace } from './workspace';

describe('isManufacturingWorkspace', () => {
  it('is true only for MANUFACTURING', () => {
    expect(isManufacturingWorkspace('MANUFACTURING')).toBe(true);
  });

  it('is false for AGRICULTURAL, null and undefined (default → agricultural)', () => {
    expect(isManufacturingWorkspace('AGRICULTURAL')).toBe(false);
    expect(isManufacturingWorkspace(null)).toBe(false);
    expect(isManufacturingWorkspace(undefined)).toBe(false);
  });
});
