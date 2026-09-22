import { AppError } from '../../../domain/errors/AppError';
import { CompanyKind } from '@prisma/client';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerAssertCompanyKindChangeAllowed(this: CompanyControllerContext, companyId: string, newKind: CompanyKind): Promise<void> {
    const workspaceKinds =
      await this.ruleOnCompanyRepository.findDistinctWorkspaceKindsByCompanyId(companyId);
    const hasIncompatibleWorkspace = workspaceKinds.some((kind) => kind !== newKind);
    if (hasIncompatibleWorkspace) {
      throw AppError.badRequest(
        `Company kind must match linked workspace kind`,
        'COMPANY_KIND_WORKSPACE_MISMATCH',
      );
    }
  }
