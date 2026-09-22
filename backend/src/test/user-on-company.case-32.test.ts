import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {

  describe('permission checks', () => {

    it('should allow EDITOR to edit, view and manage users but not delete', () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.canEdit()).toBe(true);
      expect(editorUserOnCompany.canDelete()).toBe(false);
      expect(editorUserOnCompany.canView()).toBe(true);
      expect(editorUserOnCompany.canManageUsers()).toBe(true);
    });});});
