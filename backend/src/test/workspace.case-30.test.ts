import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceInvitation Entity', () => {

  describe('isValid', () => {
    it('should return true when not expired and not accepted', () => {
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

      expect(invitation.isValid()).toBe(true);
    });});});
