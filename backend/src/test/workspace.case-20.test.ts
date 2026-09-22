import { WorkspaceMember } from '../domain/entities/WorkspaceMember';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceMember Entity', () => {

  describe('isAdmin', () => {
    it('should return true for owner role', () => {
      const member = new WorkspaceMember(
        'id',
        'workspace-id',
        'user-id',
        WorkspaceRole.OWNER,
        true,
        true,
        new Date(),
        new Date(),
      );

      expect(member.isAdmin()).toBe(true);
    });});});
