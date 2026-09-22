import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceMember Entity', () => {

  describe('isAdmin', () => {

    it('should return false for member role', () => {
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

      expect(member.isAdmin()).toBe(false);
    });});});
