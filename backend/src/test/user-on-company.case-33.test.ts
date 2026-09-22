import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {

  describe('permission checks', () => {

    it('should allow VIEWER only to view', () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.canEdit()).toBe(false);
      expect(viewerUserOnCompany.canDelete()).toBe(false);
      expect(viewerUserOnCompany.canView()).toBe(true);
      expect(viewerUserOnCompany.canManageUsers()).toBe(false);
    });});});
