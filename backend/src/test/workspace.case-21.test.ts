import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceMember Entity', () => {

  describe('isAdmin', () => {

    it('should return true for admin role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.ADMIN,
        true,
        true,
        new Date(),
        new Date(),
      );

      expect(member.isAdmin()).toBe(true);
    });});});
