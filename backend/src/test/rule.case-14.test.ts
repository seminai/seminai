import { Rule } from '../domain/entities/Rule';
describe('Rule Entity', () => {
  describe('generateSlug', () => {
    it('should generate slug from name', () => {
      const actualSlug = Rule.generateSlug('Disciplinare Emilia-Romagna 2024');
      expect(actualSlug).toBe('disciplinare-emilia-romagna-2024');
    });});});
