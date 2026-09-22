import { Workspace } from '../domain/entities/Workspace';
describe('Workspace Entity', () => {
  describe('generateSlug', () => {

    it('should handle special characters', () => {
      const actualSlug = Workspace.generateSlug('Test & Company (2024)');
      expect(actualSlug).toBe('test-company-2024');
    });});});
