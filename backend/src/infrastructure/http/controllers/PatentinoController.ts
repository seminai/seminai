import { Request, Response } from 'express';
import { IPatentinoRepository } from '../../../domain/repositories/IPatentinoRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Patentino } from '../../../domain/entities/Patentino';
import { ResourceAccessGuard } from '../../../application/use-cases/access/ResourceAccessGuard';

export class PatentinoController {
  constructor(
    private readonly patentinoRepository: IPatentinoRepository,
    private readonly accessGuard: ResourceAccessGuard,
  ) {}

  private requireUser(request: Request): string {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    return request.user.id;
  }

  async create(request: Request, response: Response): Promise<Response> {
    const ownerId = this.requireUser(request);
    const { type, code, expiresAt, releaseAt, isActive } = request.body;

    if (!type || !code || !expiresAt || !releaseAt) {
      throw AppError.badRequest('Missing required fields', 'MISSING_FIELDS');
    }

    const existing = await this.patentinoRepository.findByCode(code);
    if (existing) {
      throw AppError.conflict('Patentino code already exists', 'PATENTINO_EXISTS');
    }

    const patentino = Patentino.create({
      type,
      code,
      expiresAt: new Date(expiresAt),
      releaseAt: new Date(releaseAt),
      isActive: isActive ?? true,
      userId: ownerId,
    });

    if (!patentino.isValidCode()) {
      throw AppError.badRequest('Invalid patentino code format', 'INVALID_CODE');
    }

    if (patentino.releaseAt.getTime() >= patentino.expiresAt.getTime()) {
      throw AppError.badRequest('releaseAt must be before expiresAt', 'INVALID_DATES');
    }

    const created = await this.patentinoRepository.create(patentino);

    return response.status(201).json({
      status: 'success',
      data: { patentino: created },
    });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const patentino = await this.accessGuard.assertPatentino(userId, id);
    return response.json({ status: 'success', data: { patentino } });
  }

  async listByUser(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { userId: requestedUserId } = request.params;
    if (requestedUserId !== userId) {
      throw AppError.forbidden('Access denied to this patentino', 'PATENTINO_ACCESS_DENIED');
    }
    const patentini = await this.patentinoRepository.findManyByUserId(userId);
    return response.json({ status: 'success', data: { patentini } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    const { type, code, expiresAt, releaseAt, isActive } = request.body;

    const existing = await this.accessGuard.assertPatentino(userId, id);

    if (code && code !== existing.code) {
      const codeExists = await this.patentinoRepository.findByCode(code);
      if (codeExists) {
        throw AppError.conflict('Patentino code already exists', 'PATENTINO_EXISTS');
      }
    }

    if (expiresAt && releaseAt && new Date(releaseAt).getTime() >= new Date(expiresAt).getTime()) {
      throw AppError.badRequest('releaseAt must be before expiresAt', 'INVALID_DATES');
    }

    const updated = await this.patentinoRepository.update(id, {
      type,
      code,
      expiresAt: expiresAt ? new Date(expiresAt) : (undefined as unknown as Date),
      releaseAt: releaseAt ? new Date(releaseAt) : (undefined as unknown as Date),
      isActive,
    });

    return response.json({ status: 'success', data: { patentino: updated } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const userId = this.requireUser(request);
    const { id } = request.params;
    await this.accessGuard.assertPatentino(userId, id);
    await this.patentinoRepository.delete(id);
    return response.status(204).send();
  }
}
