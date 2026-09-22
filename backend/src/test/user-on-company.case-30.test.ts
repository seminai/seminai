import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {
  describe('role checks', () => {

    it('should correctly identify VIEWER role', () => {
      const viewerUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.VIEWER,
      );

      expect(viewerUserOnCompany.isAdmin()).toBe(false);
      expect(viewerUserOnCompany.isEditor()).toBe(false);
      expect(viewerUserOnCompany.isViewer()).toBe(true);
    });});});
