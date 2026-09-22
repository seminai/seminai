import { Skill } from '../../../domain/entities/Skill';
import { ISkillRepository } from '../../../domain/repositories/ISkillRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { CreateSkillDTO } from '../../../domain/dtos/skill.dto';
import { AppError } from '../../../domain/errors/AppError';

interface CreateSkillRequest {
  data: CreateSkillDTO;
}

export class CreateSkillUseCase {
  constructor(
    private skillRepository: ISkillRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: CreateSkillRequest): Promise<Skill> {
    const { data } = request;
    const { workspaceId, createdById } = data;

    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      workspaceId,
      createdById,
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

    const slug = data.slug || Skill.generateSlug(data.name);
    const existingSkill = await this.skillRepository.findBySlug(workspaceId, slug);
    if (existingSkill) {
      throw AppError.conflict(
        'A skill with this slug already exists in the workspace',
        'SKILL_SLUG_EXISTS',
      );
    }

    const skill = Skill.create({
      workspaceId,
      name: data.name,
      slug,
      description: data.description ?? null,
      instructions: data.instructions,
      sourceRuleId: data.sourceRuleId ?? null,
      isPublic: data.isPublic ?? false,
      createdById,
    });

    return this.skillRepository.create(skill);
  }
}
