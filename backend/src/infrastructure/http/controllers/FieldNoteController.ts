import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { CreateFieldNoteUseCase } from '../../../application/use-cases/field-note/CreateFieldNoteUseCase';
import { GetFieldNoteByIdUseCase } from '../../../application/use-cases/field-note/GetFieldNoteByIdUseCase';
import { ListFieldNotesByUserUseCase } from '../../../application/use-cases/field-note/ListFieldNotesByUserUseCase';
import { UpdateFieldNoteUseCase } from '../../../application/use-cases/field-note/UpdateFieldNoteUseCase';
import { DeleteFieldNoteUseCase } from '../../../application/use-cases/field-note/DeleteFieldNoteUseCase';
import { AddFieldNoteAttachmentUseCase } from '../../../application/use-cases/field-note/AddFieldNoteAttachmentUseCase';
import { GetFieldNoteStatsUseCase } from '../../../application/use-cases/field-note/GetFieldNoteStatsUseCase';
import {
  CreateFieldNoteDto,
  UpdateFieldNoteDto,
} from '../../../domain/dtos/field-note.dto';
import { requireAuthenticatedUserId } from './controller-auth';
import { FieldNoteAttachmentController } from './FieldNoteAttachmentController';
import { parseFieldNoteFilters } from './field-note-filters';
import { toFieldNoteResponse } from './field-note-response';

export class FieldNoteController {
  private readonly attachmentController: FieldNoteAttachmentController;

  constructor(
    private readonly createFieldNoteUseCase: CreateFieldNoteUseCase,
    private readonly getFieldNoteByIdUseCase: GetFieldNoteByIdUseCase,
    private readonly listFieldNotesByUserUseCase: ListFieldNotesByUserUseCase,
    private readonly updateFieldNoteUseCase: UpdateFieldNoteUseCase,
    private readonly deleteFieldNoteUseCase: DeleteFieldNoteUseCase,
    addFieldNoteAttachmentUseCase: AddFieldNoteAttachmentUseCase,
    private readonly getFieldNoteStatsUseCase: GetFieldNoteStatsUseCase,
  ) {
    this.attachmentController = new FieldNoteAttachmentController(addFieldNoteAttachmentUseCase);
  }

  async create(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const dto = request.body as CreateFieldNoteDto;

    if (!dto.category || !dto.rawContent) {
      throw AppError.badRequest('Category and rawContent are required', 'MISSING_REQUIRED_FIELDS');
    }

    const fieldNote = await this.createFieldNoteUseCase.execute(userId, dto);

    return response.status(201).json({
      status: 'success',
      data: { fieldNote },
    });
  }

  async getById(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;

    if (!id) {
      throw AppError.badRequest('Field note ID is required', 'MISSING_ID');
    }

    const fieldNote = await this.getFieldNoteByIdUseCase.execute(id, userId);

    return response.status(200).json({
      status: 'success',
      data: { fieldNote },
    });
  }

  async list(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);
    const fieldNotesWithRelations = await this.listFieldNotesByUserUseCase.executeWithRelations(
      userId,
      parseFieldNoteFilters(request.query),
    );
    const fieldNotes = fieldNotesWithRelations.map(toFieldNoteResponse);

    return response.status(200).json({
      status: 'success',
      data: { fieldNotes, count: fieldNotes.length },
    });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;
    const dto = request.body as UpdateFieldNoteDto;

    if (!id) {
      throw AppError.badRequest('Field note ID is required', 'MISSING_ID');
    }

    const fieldNoteWithRelations = await this.updateFieldNoteUseCase.executeWithRelations(
      id,
      userId,
      dto,
    );

    const fieldNote = toFieldNoteResponse(fieldNoteWithRelations);

    return response.status(200).json({
      status: 'success',
      data: { fieldNote },
    });
  }

  async delete(request: Request, response: Response): Promise<Response> {
    const userId = requireAuthenticatedUserId(request);

    const { id } = request.params;

    if (!id) {
      throw AppError.badRequest('Field note ID is required', 'MISSING_ID');
    }

    await this.deleteFieldNoteUseCase.execute(id, userId);

    return response.status(200).json({
      status: 'success',
      message: 'Field note deleted successfully',
    });
  }

  async addAttachment(request: Request, response: Response): Promise<Response> {
    return this.attachmentController.add(request, response);
  }

  async getStats(request: Request, response: Response): Promise<Response> {
    const stats = await this.getFieldNoteStatsUseCase.execute(
      requireAuthenticatedUserId(request),
    );

    return response.status(200).json({
      status: 'success',
      data: { stats },
    });
  }
}
