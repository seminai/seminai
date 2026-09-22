import { resolveDoseRow, type DoseRowLike } from '../perCropDoseRowResolver';

describe('resolveDoseRow', () => {
  it('matches an exact crop name with full confidence', () => {
    const inputRows: DoseRowLike[] = [{ coltura: 'Vite' }];
    const actual = resolveDoseRow({ rows: inputRows, cropName: 'vite' });
    expect(actual).toEqual({ index: 0, confidence: 1 });
  });

  it('matches a subset crop name with high confidence', () => {
    const inputRows: DoseRowLike[] = [{ coltura: 'Vite da tavola' }];
    const actual = resolveDoseRow({ rows: inputRows, cropName: 'Vite' });
    expect(actual?.index).toBe(0);
    expect(actual!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('picks the correct crop row when the label lists two crops (no cross-dose)', () => {
    const inputRows: DoseRowLike[] = [
      { coltura: 'Vite', malattia: 'Peronospora' },
      { coltura: 'Kiwi', malattia: 'Batteriosi' },
    ];
    const actual = resolveDoseRow({ rows: inputRows, cropName: 'Vite' });
    expect(actual?.index).toBe(0);
  });

  it('returns null when no row matches the crop', () => {
    const inputRows: DoseRowLike[] = [{ coltura: 'Vite' }, { coltura: 'Kiwi' }];
    const actual = resolveDoseRow({ rows: inputRows, cropName: 'Pomodoro' });
    expect(actual).toBeNull();
  });

  it('does not produce a false positive from a substring abbreviation', () => {
    // Legacy substring matching wrongly matched "col" ⊂ "colza"; the resolver must not.
    const inputRows: DoseRowLike[] = [{ coltura: 'Colza' }];
    const actual = resolveDoseRow({ rows: inputRows, cropName: 'col' });
    expect(actual).toBeNull();
  });

  it('disambiguates between same-crop rows by adversity', () => {
    const inputRows: DoseRowLike[] = [
      { coltura: 'Vite', malattia: 'Oidio' },
      { coltura: 'Vite', malattia: 'Peronospora' },
    ];
    const actual = resolveDoseRow({
      rows: inputRows,
      cropName: 'Vite',
      adversity: 'Peronospora',
    });
    expect(actual?.index).toBe(1);
  });

  it('returns null for empty rows', () => {
    const actual = resolveDoseRow({ rows: [], cropName: 'Vite' });
    expect(actual).toBeNull();
  });
});
