import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {

  describe('permission checks', () => {
    it('should allow ADMIN to edit, delete, view and manage users', () => {
      const adminUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.ADMIN,
      );

      expect(adminUserOnCompany.canEdit()).toBe(true);
      expect(adminUserOnCompany.canDelete()).toBe(true);
      expect(adminUserOnCompany.canView()).toBe(true);
      expect(adminUserOnCompany.canManageUsers()).toBe(true);
    });});});
