import { WorkspaceInvitation } from '../domain/entities/WorkspaceInvitation';
import { WorkspaceRole } from '@prisma/client';
describe('WorkspaceInvitation Entity', () => {

  describe('isValid', () => {

    it('should return false when expired', () => {
      const invitation = new WorkspaceInvitation(
        'id',
        'workspace-id',
        'test@test.com',
        WorkspaceRole.MEMBER,
        'token',
        'inviter-id',
        new Date(Date.now() - 1000),
        null,
        new Date(),
      );

      expect(invitation.isValid()).toBe(false);
    });});});
