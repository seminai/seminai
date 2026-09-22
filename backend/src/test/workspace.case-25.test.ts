import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceMember Entity', () => {

  describe('hasRuleManagementPermission', () => {

    it('should return false for regular member without permission', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.MEMBER,
        false,
        false,
        new Date(),
        new Date(),
      );

      expect(member.hasRuleManagementPermission()).toBe(false);
    });});});
