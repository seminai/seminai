import { Request, Response } from 'express';
import { GetPublicSkillBySlugUseCase } from '../../../application/use-cases/skill/GetPublicSkillBySlugUseCase';
import { ListPublicSkillsUseCase } from '../../../application/use-cases/skill/ListPublicSkillsUseCase';
import { AppError } from '../../../domain/errors/AppError';

const PUBLIC_CACHE_CONTROL = 'public, max-age=3600';

export class PublicSkillController {
  constructor(
    private readonly listPublicSkillsUseCase: ListPublicSkillsUseCase,
    private readonly getPublicSkillBySlugUseCase: GetPublicSkillBySlugUseCase,
  ) {}

  async list(request: Request, response: Response): Promise<Response> {
    const page = await this.listPublicSkillsUseCase.execute({
      filters: {
        search: this.parseString(request.query.search),
        page: this.parseNumber(request.query.page),
        limit: this.parseNumber(request.query.limit),
      },
    });
    response.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    return response.json({ status: 'success', data: { skills: page } });
  }

  async findBySlug(request: Request, response: Response): Promise<Response> {
    const { slug } = request.params;
    if (!slug) throw AppError.badRequest('Slug is required', 'MISSING_SLUG');
    const skill = await this.getPublicSkillBySlugUseCase.execute(slug);
    response.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    return response.json({ status: 'success', data: { skill } });
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
