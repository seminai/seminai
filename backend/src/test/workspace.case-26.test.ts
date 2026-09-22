import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceInvitation Entity', () => {
  describe('isExpired', () => {
    it('should return true when expired', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() - 1000), // Past date
        null,
        new Date(),
      );

      expect(invitation.isExpired()).toBe(true);
    });});});
