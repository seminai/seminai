import { Skill } from '../../../domain/entities/Skill';
import { ISkillRepository } from '../../../domain/repositories/ISkillRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { UpdateSkillDTO } from '../../../domain/dtos/skill.dto';
import { AppError } from '../../../domain/errors/AppError';

interface UpdateSkillRequest {
  skillId: string;
  userId: string;
  data: UpdateSkillDTO;
}

export class UpdateSkillUseCase {
  constructor(
    private skillRepository: ISkillRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: UpdateSkillRequest): Promise<Skill> {
    const { skillId, userId, data } = request;

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

    if (data.slug && data.slug !== skill.slug) {
      const slugExists = await this.skillRepository.findBySlug(skill.workspaceId, data.slug);
      if (slugExists) {
        throw AppError.conflict('A skill with this slug already exists', 'SKILL_SLUG_EXISTS');
      }
    }

    return this.skillRepository.update(skillId, data);
  }
}
