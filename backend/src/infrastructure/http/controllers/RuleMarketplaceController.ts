import { Request, Response } from 'express';
import { RuleCategory } from '@prisma/client';
import { CreateRuleFromPublicUseCase } from '../../../application/use-cases/rule/CreateRuleFromPublicUseCase';
import { ListRuleMarketplaceUseCase } from '../../../application/use-cases/rule/ListRuleMarketplaceUseCase';
import { AppError } from '../../../domain/errors/AppError';

export class RuleMarketplaceController {
  constructor(
    private readonly listRuleMarketplaceUseCase: ListRuleMarketplaceUseCase,
    private readonly createRuleFromPublicUseCase: CreateRuleFromPublicUseCase,
  ) {}

  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const marketplace = await this.listRuleMarketplaceUseCase.execute({
      filters: {
        category: this.parseCategory(request.query.category),
        region: this.parseString(request.query.region),
        creator: this.parseString(request.query.creator),
        search: this.parseString(request.query.search),
        page: this.parseNumber(request.query.page),
        limit: this.parseNumber(request.query.limit),
      },
    });
    return response.json({ status: 'success', data: { marketplace } });
  }

  async createFromPublic(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { workspaceId, ruleId } = request.params;
    if (!workspaceId) throw AppError.badRequest('Workspace ID is required', 'MISSING_WORKSPACE_ID');
    if (!ruleId) throw AppError.badRequest('Rule ID is required', 'MISSING_RULE_ID');
    const rule = await this.createRuleFromPublicUseCase.execute({
      workspaceId,
      publicRuleId: ruleId,
      userId: request.user.id,
    });
    return response.status(201).json({ status: 'success', data: { rule } });
  }

  private parseString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private parseNumber(value: unknown): number | undefined {
    if (typeof value !== 'string') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private parseCategory(value: unknown): RuleCategory | undefined {
    if (typeof value !== 'string') return undefined;
    const allowed: readonly string[] = [
      'DISCIPLINARE',
      'STANDARD',
      'BEST_PRACTICE',
      'METHODOLOGY',
      'CUSTOM',
    ];
    return allowed.includes(value) ? (value as RuleCategory) : undefined;
  }
}
