import { Workspace } from '../domain/entities/Workspace';
describe('Workspace Entity', () => {
  describe('generateSlug', () => {

    it('should handle accented characters', () => {
      const actualSlug = Workspace.generateSlug('Società Agricola Città');
      expect(actualSlug).toBe('societa-agricola-citta');
    });});});
