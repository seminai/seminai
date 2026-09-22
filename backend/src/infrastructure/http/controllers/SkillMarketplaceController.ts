import { Request, Response } from 'express';
import { CreateSkillFromPublicUseCase } from '../../../application/use-cases/skill/CreateSkillFromPublicUseCase';
import { ListSkillMarketplaceUseCase } from '../../../application/use-cases/skill/ListSkillMarketplaceUseCase';
import { AppError } from '../../../domain/errors/AppError';

export class SkillMarketplaceController {
  constructor(
    private readonly listSkillMarketplaceUseCase: ListSkillMarketplaceUseCase,
    private readonly createSkillFromPublicUseCase: CreateSkillFromPublicUseCase,
  ) {}

  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const marketplace = await this.listSkillMarketplaceUseCase.execute({
      filters: {
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
    const { workspaceId, skillId } = request.params;
    if (!workspaceId) throw AppError.badRequest('Workspace ID is required', 'MISSING_WORKSPACE_ID');
    if (!skillId) throw AppError.badRequest('Skill ID is required', 'MISSING_SKILL_ID');
    const skill = await this.createSkillFromPublicUseCase.execute({
      workspaceId,
      publicSkillId: skillId,
      userId: request.user.id,
    });
    return response.status(201).json({ status: 'success', data: { skill } });
  }

  private parseString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private parseNumber(value: unknown): number | undefined {
    if (typeof value !== 'string') return undefined;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}
