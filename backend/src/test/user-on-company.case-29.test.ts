import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {
  describe('role checks', () => {

    it('should correctly identify EDITOR role', () => {
      const editorUserOnCompany = new UserOnCompany(
        'uoc-1',
        'company-1',
        'user-1',
        null,
        CompanyRole.EDITOR,
      );

      expect(editorUserOnCompany.isAdmin()).toBe(false);
      expect(editorUserOnCompany.isEditor()).toBe(true);
      expect(editorUserOnCompany.isViewer()).toBe(false);
    });});});
