import { Workspace } from '../domain/entities/Workspace';
import { WorkspacePlan, WorkspaceKind } from '@prisma/client';
describe('Workspace Entity', () => {

  describe('hasEnterpriseFeatures', () => {

    it('should return false for free plan', () => {
      const workspace = new Workspace(
        'id',
        'name',
        'slug',
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        WorkspaceKind.AGRICULTURAL,
        WorkspacePlan.FREE,
        true,
        5,
        50,
        new Date(),
        new Date(),
      );

      expect(workspace.hasEnterpriseFeatures()).toBe(false);
    });});});
