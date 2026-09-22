import { Request, Response } from 'express';
import { RuleCategory } from '@prisma/client';
import { GetPublicRuleBySlugUseCase } from '../../../application/use-cases/rule/GetPublicRuleBySlugUseCase';
import { ListPublicRuleCategoriesUseCase } from '../../../application/use-cases/rule/ListPublicRuleCategoriesUseCase';
import { ListPublicRulesUseCase } from '../../../application/use-cases/rule/ListPublicRulesUseCase';
import { AppError } from '../../../domain/errors/AppError';

const PUBLIC_CACHE_CONTROL = 'public, max-age=3600';
const RULE_CATEGORIES: readonly string[] = [
  'DISCIPLINARE',
  'STANDARD',
  'BEST_PRACTICE',
  'METHODOLOGY',
  'CUSTOM',
];

export class PublicRuleController {
  constructor(
    private readonly listPublicRulesUseCase: ListPublicRulesUseCase,
    private readonly getPublicRuleBySlugUseCase: GetPublicRuleBySlugUseCase,
    private readonly listPublicRuleCategoriesUseCase: ListPublicRuleCategoriesUseCase,
  ) {}

  async list(request: Request, response: Response): Promise<Response> {
    const page = await this.listPublicRulesUseCase.execute({
      filters: {
        category: this.parseCategory(request.query.category),
        region: this.parseString(request.query.region),
        search: this.parseString(request.query.search),
        page: this.parseNumber(request.query.page),
        limit: this.parseNumber(request.query.limit),
      },
    });
    response.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    return response.json({ status: 'success', data: { rules: page } });
  }

  async findBySlug(request: Request, response: Response): Promise<Response> {
    const { slug } = request.params;
    if (!slug) throw AppError.badRequest('Slug is required', 'MISSING_SLUG');
    const rule = await this.getPublicRuleBySlugUseCase.execute(slug);
    response.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    return response.json({ status: 'success', data: { rule } });
  }

  async listCategories(_request: Request, response: Response): Promise<Response> {
    const categories = await this.listPublicRuleCategoriesUseCase.execute();
    response.setHeader('Cache-Control', PUBLIC_CACHE_CONTROL);
    return response.json({ status: 'success', data: { categories } });
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
    return RULE_CATEGORIES.includes(value) ? (value as RuleCategory) : undefined;
  }
}
