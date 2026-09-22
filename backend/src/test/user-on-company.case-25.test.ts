import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('ensureCompanyRole Middleware Authorization', () => {

  describe('removeUserFromCompany authorization', () => {

    it('should allow EDITOR to remove users from company', async () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-editor',
        'company-123',
        'editor-user-789',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.canManageUsers()).toBe(true);
      expect(editorUserOnCompany.isEditor()).toBe(true);
    });});});
