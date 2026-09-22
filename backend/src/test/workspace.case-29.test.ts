import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceInvitation Entity', () => {

  describe('isAccepted', () => {

    it('should return false when not accepted', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60),
        null,
        new Date(),
      );

      expect(invitation.isAccepted()).toBe(false);
    });});});
