import { Workspace } from '../domain/entities/Workspace';
describe('Workspace Entity', () => {
  describe('generateSlug', () => {
    it('should generate slug from name', () => {
      const actualSlug = Workspace.generateSlug('Studio Agronomico Rossi');
      expect(actualSlug).toBe('studio-agronomico-rossi');
    });});});
