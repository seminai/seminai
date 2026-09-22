import { Workspace } from '../../../domain/entities/Workspace';
import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { UpdateWorkspaceDTO } from '../../../domain/dtos/workspace.dto';
import { AppError } from '../../../domain/errors/AppError';
import { UserRole } from '@prisma/client';
import { WorkspacePlanLimitsPolicy } from '../../services/workspace/WorkspacePlanLimitsPolicy';
import { resolveEnabledModules } from '../../services/workspace/resolveEnabledModules';

interface UpdateWorkspaceRequest {
  workspaceId: string;
  userId: string;
  userRole?: UserRole;
  data: UpdateWorkspaceDTO;
}

export class UpdateWorkspaceUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: UpdateWorkspaceRequest): Promise<Workspace> {
    const { workspaceId, userId, userRole, data } = request;

    // Check if user is admin of the workspace
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.isAdmin()) {
      throw AppError.forbidden('Only admins can update workspace settings', 'NOT_ADMIN');
    }

    const existingWorkspace = await this.workspaceRepository.findById(workspaceId);
    if (!existingWorkspace) {
      throw AppError.notFound('Workspace not found', 'WORKSPACE_NOT_FOUND');
    }
    const nextPlan = data.plan || existingWorkspace.plan;
    const nextLimits = WorkspacePlanLimitsPolicy.getLimits(nextPlan);

    // Check if new slug is unique (if provided)
    if (data.slug && data.slug !== existingWorkspace.slug) {
      const slugExists = await this.workspaceRepository.findBySlug(data.slug);
      if (slugExists) {
        throw AppError.conflict(
          'A workspace with this slug already exists',
          'WORKSPACE_SLUG_EXISTS',
        );
      }
    }

    // Only allow customCss for enterprise plans
    if (data.customCss && !WorkspacePlanLimitsPolicy.hasEnterpriseFeatures(nextPlan)) {
      throw AppError.forbidden(
        'Custom CSS is only available for Enterprise plans',
        'ENTERPRISE_ONLY',
      );
    }
    if (WorkspacePlanLimitsPolicy.isDowngrade(existingWorkspace.plan, nextPlan)) {
      const [memberCount, ruleCount] = await Promise.all([
        this.workspaceRepository.countMembers(workspaceId),
        this.workspaceRepository.countRules(workspaceId),
      ]);
      if (memberCount > nextLimits.maxMembers || ruleCount > nextLimits.maxRules) {
        throw AppError.badRequest(
          'Cannot downgrade plan because current usage exceeds target plan limits',
          'PLAN_DOWNGRADE_LIMIT_EXCEEDED',
        );
      }
    }
    const updatePayload = {
      ...data,
      plan: nextPlan,
      maxMembers: nextLimits.maxMembers,
      maxRules: nextLimits.maxRules,
      ...(data.enabledModules !== undefined
        ? { enabledModules: resolveEnabledModules(data.enabledModules, userRole) }
        : {}),
    };
    return this.workspaceRepository.update(workspaceId, updatePayload);
  }
}
