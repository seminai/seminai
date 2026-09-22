import { ISkillRepository } from '../../../domain/repositories/ISkillRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';

interface DeleteSkillRequest {
  skillId: string;
  userId: string;
}

export class DeleteSkillUseCase {
  constructor(
    private skillRepository: ISkillRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: DeleteSkillRequest): Promise<void> {
    const { skillId, userId } = request;

    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw AppError.notFound('Skill not found', 'SKILL_NOT_FOUND');
    }

    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      skill.workspaceId,
      userId,
    );
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden(
        'You do not have permission to manage skills',
        'NO_SKILL_PERMISSION',
      );
    }

    await this.skillRepository.delete(skillId);
  }
}
