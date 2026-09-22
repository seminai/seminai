import { Skill } from '../../../domain/entities/Skill';
import { AppError } from '../../../domain/errors/AppError';
import { ISkillRepository } from '../../../domain/repositories/ISkillRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';

interface CreateSkillFromPublicRequest {
  readonly publicSkillId: string;
  readonly workspaceId: string;
  readonly userId: string;
}

export class CreateSkillFromPublicUseCase {
  constructor(
    private readonly skillRepository: ISkillRepository,
    private readonly workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: CreateSkillFromPublicRequest): Promise<Skill> {
    const source = await this.getPublicSourceSkill(request.publicSkillId);
    await this.assertCanCreateSkill(request.workspaceId, request.userId);
    const skill = Skill.create({
      workspaceId: request.workspaceId,
      name: `${source.name} (copy)`,
      slug: await this.generateCopySlug(request.workspaceId, source.slug),
      description: source.description,
      instructions: source.instructions,
      sourceRuleId: source.sourceRuleId,
      isPublic: false,
      createdById: request.userId,
    });
    return this.skillRepository.create(skill);
  }

  private async getPublicSourceSkill(skillId: string): Promise<Skill> {
    const source = await this.skillRepository.findById(skillId);
    if (!source) throw AppError.notFound('Skill not found', 'SKILL_NOT_FOUND');
    if (!source.isPublic || !source.isActive()) {
      throw AppError.forbidden('Skill is not available in marketplace', 'SKILL_NOT_PUBLIC');
    }
    return source;
  }

  private async assertCanCreateSkill(workspaceId: string, userId: string): Promise<void> {
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }
    if (!member.hasRuleManagementPermission()) {
      throw AppError.forbidden(
        'You do not have permission to manage skills',
        'NO_SKILL_PERMISSION',
      );
    }
  }

  private async generateCopySlug(workspaceId: string, sourceSlug: string): Promise<string> {
    const base = `${sourceSlug}-copy`;
    for (let index = 0; index < 100; index += 1) {
      const candidate = index === 0 ? base : `${base}-${index + 1}`;
      const existing = await this.skillRepository.findBySlug(workspaceId, candidate);
      if (!existing) return candidate;
    }
    throw AppError.conflict('Unable to generate a unique skill slug', 'SKILL_SLUG_EXISTS');
  }
}
