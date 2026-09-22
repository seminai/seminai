import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceMember Entity', () => {

  describe('hasRuleManagementPermission', () => {
    it('should return true for admin', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.ADMIN,
        false,
        false,
        new Date(),
        new Date(),
      );

      expect(member.hasRuleManagementPermission()).toBe(true);
    });});});
