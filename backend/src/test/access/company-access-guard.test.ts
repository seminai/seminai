import { CompanyAccessGuard } from '../../application/use-cases/access/CompanyAccessGuard';
import { UserOnCompany } from '../../domain/entities/UserOnCompany';
import { IUserOnCompanyRepository } from '../../domain/repositories/IUserOnCompanyRepository';
import { CompanyRole } from '@prisma/client';

describe('CompanyAccessGuard', () => {
  it('allows a company member', async () => {
    const guard = new CompanyAccessGuard(createMembershipRepo(['company-a']));
    await expect(guard.assertMember('user-1', 'company-a')).resolves.toBeUndefined();
  });

  it('rejects a missing company id', async () => {
    const guard = new CompanyAccessGuard(createMembershipRepo(['company-a']));
    await expect(guard.assertMember('user-1', null)).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('rejects a user who is not a member', async () => {
    const guard = new CompanyAccessGuard(createMembershipRepo(['company-a']));
    await expect(guard.assertMember('user-1', 'company-b')).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('allows access when the user belongs to any linked company', async () => {
    const guard = new CompanyAccessGuard(createMembershipRepo(['company-b']));
    await expect(
      guard.assertMemberOfAny('user-1', ['company-a', 'company-b']),
    ).resolves.toBeUndefined();
  });

  it('rejects an empty company id list', async () => {
    const guard = new CompanyAccessGuard(createMembershipRepo(['company-a']));
    await expect(guard.assertMemberOfAny('user-1', [])).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });

  it('rejects when none of the companies match', async () => {
    const guard = new CompanyAccessGuard(createMembershipRepo(['company-a']));
    await expect(guard.assertMemberOfAny('user-1', ['company-b'])).rejects.toMatchObject({
      statusCode: 403,
      code: 'NO_COMPANY_ACCESS',
    });
  });
});

function createMembershipRepo(companyIds: readonly string[]): IUserOnCompanyRepository {
  const memberships = companyIds.map(
    (companyId) => new UserOnCompany('m1', companyId, 'user-1', null, CompanyRole.VIEWER),
  );
  return {
    create: async (row) => row,
    findById: async () => null,
    findByCompanyId: async () => [],
    findByCompanyIdWithDetails: async () => [],
    findByUserId: async () => memberships,
    findByUserIdWithDetails: async () => [],
    findByCompanyAndUser: async (companyId) =>
      memberships.find((membership) => membership.companyId === companyId) ?? null,
    update: async (_id, row) => row as UserOnCompany,
    delete: async () => undefined,
    deleteByCompanyAndUser: async () => undefined,
  };
}
