import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {
  describe('role checks', () => {
    it('should correctly identify ADMIN role', () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.isAdmin()).toBe(true);
      expect(adminUserOnCompany.isEditor()).toBe(false);
      expect(adminUserOnCompany.isViewer()).toBe(false);
    });});});
