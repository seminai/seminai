import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { RuleListFiltersDTO, RuleWithAssignmentsDTO } from '../../../domain/dtos/rule.dto';
import { AppError } from '../../../domain/errors/AppError';

interface ListRulesRequest {
  workspaceId: string;
  userId: string;
  filters?: RuleListFiltersDTO;
}

export class ListRulesUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: ListRulesRequest): Promise<RuleWithAssignmentsDTO[]> {
    const { workspaceId, userId, filters } = request;

    // Check workspace membership
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(workspaceId, userId);
    if (!member) {
      throw AppError.forbidden('You are not a member of this workspace', 'NOT_WORKSPACE_MEMBER');
    }

    return this.ruleRepository.findWithFiltersAndCounts({
      ...filters,
      workspaceId,
    });
  }
}
