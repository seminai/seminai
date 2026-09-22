import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('ensureCompanyRole Middleware Authorization', () => {
  describe('addUserToCompany authorization', () => {

    it('should NOT allow VIEWER to add users to company', async () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-viewer',
        'company-123',
        'viewer-user-789',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.canManageUsers()).toBe(false);
      expect(viewerUserOnCompany.isViewer()).toBe(true);
    });});});
