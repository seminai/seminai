import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { resolveWorkspaceCompanyScope } from '../../../application/services/workspace/resolve-workspace-company-scope';
import type { CompanyControllerContext } from './company-controller.context';

export async function companyControllerListForCurrentUser(this: CompanyControllerContext, request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const workspaceId =
      typeof request.query.workspaceId === 'string' ? request.query.workspaceId.trim() : undefined;

    const companies =
      workspaceId && workspaceId.length > 0
        ? await resolveWorkspaceCompanyScope({
            userId: request.user.id,
            workspaceId,
            companyRepository: this.companyRepository,
            companyOnWorkspaceRepository: this.companyOnWorkspaceRepository,
            workspaceMemberRepository: this.workspaceMemberRepository,
          })
        : await this.companyRepository.findManyByUserId(request.user.id);

    return response.json({ status: 'success', data: { companies } });
  }
