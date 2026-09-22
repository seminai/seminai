import { UserOnCompany } from '../domain/entities/UserOnCompany';
import { CompanyRole } from '@prisma/client';

jest.mock('../application/use-cases/user-on-company/AddUserToCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/UpdateUserRoleUseCase');
jest.mock('../application/use-cases/user-on-company/RemoveUserFromCompanyUseCase');
jest.mock('../application/use-cases/user-on-company/ResendCompanyInvitationUseCase');
describe('UserOnCompany Entity', () => {

  describe('static methods', () => {

    it('should create UserOnCompany from Prisma object', () => {
      const prismaUserOnCompany = {
        id: 'uoc-123',
        companyId: 'company-456',
        userId: 'user-789',
        type: null,
        role: CompanyRole.EDITOR,
      };

      const userOnCompany = UserOnCompany.fromPrisma(prismaUserOnCompany);

      expect(userOnCompany.id).toBe('uoc-123');
      expect(userOnCompany.companyId).toBe('company-456');
      expect(userOnCompany.userId).toBe('user-789');
      expect(userOnCompany.role).toBe(CompanyRole.EDITOR);
    });});});
