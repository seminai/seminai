import { describe, expect, it } from 'vitest';
import type { Polygon } from 'geojson';
import { polygonAreaHa } from './geo-utils';

describe('polygonAreaHa', () => {
  it('computes ~1 ha for a ~100m x 100m square at the equator', () => {
    const side = 0.0009; // ≈100m in degrees at the equator
    const square: Polygon = {
      type: 'Polygon',
      coordinates: [
        [
          [0, 0],
          [side, 0],
          [side, side],
          [0, side],
          [0, 0],
        ],
      ],
    };
    const area = polygonAreaHa(square);
    expect(area).toBeGreaterThan(0.98);
    expect(area).toBeLessThan(1.03);
  });

  it('returns 0 for a degenerate ring', () => {
    const degenerate: Polygon = {
      type: 'Polygon',
      coordinates: [[[0, 0], [1, 1], [0, 0]]],
    };
    expect(polygonAreaHa(degenerate)).toBe(0);
  });
});
