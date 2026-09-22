import { generateFollowUpSuggestions } from '../streaming-follow-ups';
import type { WorkingMemory } from '../type/state';

function makeMemory(overrides: Partial<WorkingMemory> = {}): WorkingMemory {
  return overrides as WorkingMemory;
}

describe('generateFollowUpSuggestions — locale routing', () => {
  it('returns Italian text when language is "it"', () => {
    const memory = makeMemory({ dosageResults: [{} as never] });
    const suggestions = generateFollowUpSuggestions(memory, [], 'it');
    expect(suggestions.length).toBeGreaterThan(0);
    const compliance = suggestions.find((s) => s.id === 'suggest_compliance');
    expect(compliance?.text).toBe('Vuoi verificare la conformità ai disciplinari regionali?');
  });

  it('returns English text when language is "en"', () => {
    const memory = makeMemory({ dosageResults: [{} as never] });
    const suggestions = generateFollowUpSuggestions(memory, [], 'en');
    const compliance = suggestions.find((s) => s.id === 'suggest_compliance');
    expect(compliance?.text).toBe('Want to verify compliance with regional protocols?');
    expect(compliance?.action).toContain("region's protocols");
  });

  it('defaults to Italian when language argument is omitted (backwards compatibility)', () => {
    const memory = makeMemory({ dosageResults: [{} as never] });
    const suggestions = generateFollowUpSuggestions(memory, []);
    const compliance = suggestions.find((s) => s.id === 'suggest_compliance');
    expect(compliance?.text).toContain('disciplinari');
  });

  it('localizes the violations suggestion in English', () => {
    const memory = makeMemory({
      dosageResults: [{} as never],
      complianceResult: { violations: [{} as never] },
    });
    const suggestions = generateFollowUpSuggestions(memory, [], 'en');
    const fix = suggestions.find((s) => s.id === 'suggest_fix_violations');
    expect(fix?.text).toBe('Want to automatically fix the non-compliant treatments?');
  });

  it('localizes the stock-check suggestion in English when conformity ran', () => {
    const memory = makeMemory({});
    const suggestions = generateFollowUpSuggestions(memory, ['run_conformity_check'], 'en');
    const stock = suggestions.find((s) => s.id === 'suggest_stock_check');
    expect(stock?.text).toBe('Want to check stock availability?');
  });

  it('caps to 3 suggestions regardless of language', () => {
    const memory = makeMemory({
      dosageResults: [{} as never],
      complianceResult: { violations: [{} as never] },
      activePlan: {} as never,
    });
    const suggestions = generateFollowUpSuggestions(memory, ['run_conformity_check'], 'en');
    expect(suggestions.length).toBeLessThanOrEqual(3);
  });
});
