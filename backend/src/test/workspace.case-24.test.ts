import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceMember Entity', () => {

  describe('hasRuleManagementPermission', () => {

    it('should return true when canManageRules is true', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.MEMBER,
        true,
        false,
        new Date(),
        new Date(),
      );

      expect(member.hasRuleManagementPermission()).toBe(true);
    });});});
