import { Skill } from '../../../domain/entities/Skill';
import { ISkillRepository } from '../../../domain/repositories/ISkillRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { SkillListFiltersDTO } from '../../../domain/dtos/skill.dto';
import { AppError } from '../../../domain/errors/AppError';

interface ListSkillsRequest {
  workspaceId: string;
  userId: string;
  filters?: Omit<SkillListFiltersDTO, 'workspaceId'>;
}

export class ListSkillsUseCase {
  constructor(
    private skillRepository: ISkillRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: ListSkillsRequest): Promise<Skill[]> {
    const { workspaceId, userId, filters } = request;

    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    return this.skillRepository.findWithFilters({ ...filters, workspaceId });
  }
}
