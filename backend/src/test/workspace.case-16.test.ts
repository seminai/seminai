import { Workspace } from '../domain/entities/Workspace';
import { WorkspacePlan, WorkspaceKind } from '@prisma/client';
describe('Workspace Entity', () => {

  describe('hasEnterpriseFeatures', () => {
    it('should return true for enterprise plan', () => {
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
        WorkspacePlan.ENTERPRISE,
        true,
        100,
        500,
        new Date(),
        new Date(),
      );

      expect(workspace.hasEnterpriseFeatures()).toBe(true);
    });});});
