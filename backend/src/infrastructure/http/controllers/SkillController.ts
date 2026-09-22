import { Request, Response } from 'express';
import { SkillStatus } from '@prisma/client';
import { CreateSkillUseCase } from '../../../application/use-cases/skill/CreateSkillUseCase';
import { GetSkillUseCase } from '../../../application/use-cases/skill/GetSkillUseCase';
import { ListSkillsUseCase } from '../../../application/use-cases/skill/ListSkillsUseCase';
import { UpdateSkillUseCase } from '../../../application/use-cases/skill/UpdateSkillUseCase';
import { DeleteSkillUseCase } from '../../../application/use-cases/skill/DeleteSkillUseCase';
import { AppError } from '../../../domain/errors/AppError';

export class SkillController {
  constructor(
    private createSkillUseCase: CreateSkillUseCase,
    private getSkillUseCase: GetSkillUseCase,
    private listSkillsUseCase: ListSkillsUseCase,
    private updateSkillUseCase: UpdateSkillUseCase,
    private deleteSkillUseCase: DeleteSkillUseCase,
  ) {}

  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { workspaceId } = request.params;
    const { name, slug, description, instructions, sourceRuleId, isPublic } = request.body;

    if (!name) throw AppError.badRequest('Name is required', 'MISSING_NAME');
    if (!instructions)
      throw AppError.badRequest('Instructions are required', 'MISSING_INSTRUCTIONS');

    const skill = await this.createSkillUseCase.execute({
      data: {
        workspaceId,
        name,
        slug,
        description,
        instructions,
        sourceRuleId,
        isPublic,
        createdById: request.user.id,
      },
    });

    return response.status(201).json({ status: 'success', data: { skill } });
  }

  async findById(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { id } = request.params;
    const skill = await this.getSkillUseCase.execute({ skillId: id, userId: request.user.id });
    return response.json({ status: 'success', data: { skill } });
  }

  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { workspaceId } = request.params;
    const { status, search } = request.query;

    const skills = await this.listSkillsUseCase.execute({
      workspaceId,
      userId: request.user.id,
      filters: {
        status: status as SkillStatus | undefined,
        search: search as string | undefined,
      },
    });

    return response.json({ status: 'success', data: { skills } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { id } = request.params;
    const skill = await this.updateSkillUseCase.execute({
      skillId: id,
      userId: request.user.id,
      data: request.body,
    });
    return response.json({ status: 'success', data: { skill } });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }
    const { id } = request.params;
    await this.deleteSkillUseCase.execute({ skillId: id, userId: request.user.id });
    return response.status(204).send();
  }
}
