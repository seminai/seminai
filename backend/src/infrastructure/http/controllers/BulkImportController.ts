import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { BulkImportDTO } from '../../../domain/dtos/field-production-unit-bulk-import.dto';
import { BulkImportFieldsAndProductionUnitsUseCase } from '../../../application/use-cases/bulk-import/BulkImportFieldsAndProductionUnitsUseCase';

export class BulkImportController {
  constructor(private readonly bulkImportUseCase: BulkImportFieldsAndProductionUnitsUseCase) {}

  async bulkImportFieldsAndProductionUnits(
    request: Request,
    response: Response,
  ): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const body = request.body as BulkImportDTO;

    if (!body.fields && !body.productionUnits) {
      throw AppError.badRequest(
        'Either fields or productionUnits must be provided',
        'MISSING_DATA',
      );
    }

    const result = await this.bulkImportUseCase.execute({
      userId: request.user.id,
      companyName: body.companyName,
      vatNumber: body.vatNumber,
      fields: body.fields || [],
      productionUnits: body.productionUnits || [],
    });

    return response.status(201).json({
      status: 'success',
      data: result,
    });
  }
}
