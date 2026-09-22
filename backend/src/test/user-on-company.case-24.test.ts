import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('ensureCompanyRole Middleware Authorization', () => {

  describe('removeUserFromCompany authorization', () => {
    it('should allow ADMIN to remove users from company', async () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-admin',
        'company-123',
        'admin-user-789',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.canManageUsers()).toBe(true);
      expect(adminUserOnCompany.isAdmin()).toBe(true);
    });});});
