import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {

  describe('static methods', () => {
    it('should create a new UserOnCompany with generated ID', () => {
      const userOnCompany = UserOnCompany.create({
        companyId: 'company-1',
        userId: 'user-1',
        type: null,
        role: CompanyRole.ADMIN,
      });

      expect(userOnCompany.id).toBeDefined();
      expect(userOnCompany.companyId).toBe('company-1');
      expect(userOnCompany.userId).toBe('user-1');
      expect(userOnCompany.role).toBe(CompanyRole.ADMIN);
    });});});
