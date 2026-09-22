import { Skill } from '../../../domain/entities/Skill';
import { ISkillRepository } from '../../../domain/repositories/ISkillRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { AppError } from '../../../domain/errors/AppError';

interface GetSkillRequest {
  skillId: string;
  userId: string;
}

export class GetSkillUseCase {
  constructor(
    private skillRepository: ISkillRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: GetSkillRequest): Promise<Skill> {
    const { skillId, userId } = request;

    const skill = await this.skillRepository.findById(skillId);
    if (!skill) {
      throw AppError.notFound('Skill not found', 'SKILL_NOT_FOUND');
    }

    if (skill.isPublic) {
      return skill;
    }

    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      skill.workspaceId,
      userId,
    );
    if (!member) {
      throw AppError.forbidden('You do not have access to this skill', 'NO_SKILL_ACCESS');
    }

    return skill;
  }
}
