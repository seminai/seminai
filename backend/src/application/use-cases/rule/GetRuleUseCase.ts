import { IRuleRepository } from '../../../domain/repositories/IRuleRepository';
import { IWorkspaceMemberRepository } from '../../../domain/repositories/IWorkspaceMemberRepository';
import { RuleWithAssignmentsDTO } from '../../../domain/dtos/rule.dto';
import { AppError } from '../../../domain/errors/AppError';

interface GetRuleRequest {
  ruleId: string;
  userId: string;
}

export class GetRuleUseCase {
  constructor(
    private ruleRepository: IRuleRepository,
    private workspaceMemberRepository: IWorkspaceMemberRepository,
  ) {}

  async execute(request: GetRuleRequest): Promise<RuleWithAssignmentsDTO> {
    const { ruleId, userId } = request;

    const rule = await this.ruleRepository.findWithCounts(ruleId);
    if (!rule) {
      throw AppError.notFound('Rule not found', 'RULE_NOT_FOUND');
    }

    // If rule is public, anyone can view it
    if (rule.isPublic) {
      return rule;
    }

    // Otherwise check workspace membership
    const member = await this.workspaceMemberRepository.findByWorkspaceAndUser(
      rule.workspaceId,
      userId,
    );
    if (!member) {
      throw AppError.forbidden('You do not have access to this rule', 'NO_RULE_ACCESS');
    }

    return rule;
  }
}
