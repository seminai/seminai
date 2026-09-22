import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('ensureCompanyRole Middleware Authorization', () => {

  describe('permission matrix', () => {
    it('should verify complete permission matrix for all roles', () => {
      const admin = new UserOnCompany('1', 'c1', 'u1', null, CompanyRole.ADMIN);
      const editor = new UserOnCompany('2', 'c1', 'u2', null, CompanyRole.EDITOR);
      const viewer = new UserOnCompany('3', 'c1', 'u3', null, CompanyRole.VIEWER);

      // ADMIN permissions
      expect(admin.canManageUsers()).toBe(true);
      expect(admin.canEdit()).toBe(true);
      expect(admin.canDelete()).toBe(true);
      expect(admin.canView()).toBe(true);

      // EDITOR permissions
      expect(editor.canManageUsers()).toBe(true);
      expect(editor.canEdit()).toBe(true);
      expect(editor.canDelete()).toBe(false);
      expect(editor.canView()).toBe(true);

      // VIEWER permissions
      expect(viewer.canManageUsers()).toBe(false);
      expect(viewer.canEdit()).toBe(false);
      expect(viewer.canDelete()).toBe(false);
      expect(viewer.canView()).toBe(true);
    });});});
