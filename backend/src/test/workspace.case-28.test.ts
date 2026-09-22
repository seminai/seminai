import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceInvitation Entity', () => {

  describe('isAccepted', () => {
    it('should return true when accepted', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() + 1000 * 60 * 60),
        new Date(),
        new Date(),
      );

      expect(invitation.isAccepted()).toBe(true);
    });});});
