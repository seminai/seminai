import { Rule } from '../domain/entities/Rule';
describe('Rule Entity', () => {
  describe('generateSlug', () => {

    it('should handle accented characters', () => {
      const actualSlug = Rule.generateSlug('Metodologia Città Agricole');
      expect(actualSlug).toBe('metodologia-citta-agricole');
    });});});
