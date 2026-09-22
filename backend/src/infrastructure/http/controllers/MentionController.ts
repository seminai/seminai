import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { prisma } from '../../repositories/Prisma';
import { PrismaMentionSearchRepository } from '../../repositories/PrismaMentionSearchRepository';
import { SearchMentionsUseCase } from '../../../application/use-cases/mention/SearchMentionsUseCase';

/**
 * Controller for mention search operations.
 * Provides a unified autocomplete endpoint for the chat @mention system.
 */
export class MentionController {
  /**
   * Search mentionable entities across all supported types.
   * GET /mentions/search?q=term&types=company,product
   */
  async search(req: Request, res: Response): Promise<Response> {
    if (!req.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { q, types } = req.query as { q?: string; types?: string };

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      throw AppError.badRequest('Query parameter "q" is required', 'MISSING_QUERY');
    }

    const parsedTypes = types ? types.split(',').map((t) => t.trim()) : undefined;

    const repository = new PrismaMentionSearchRepository(prisma);
    const useCase = new SearchMentionsUseCase(repository);

    const result = await useCase.execute({
      userId: req.user.id,
      query: q,
      types: parsedTypes,
    });

    return res.status(200).json({
      status: 'success',
      data: result.items,
    });
  }
}
