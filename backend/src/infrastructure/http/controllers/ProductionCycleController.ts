import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { ListProductionCyclesUseCase } from '../../../application/use-cases/production-cycle/ListProductionCyclesUseCase';
import { CreateProductionCycleUseCase } from '../../../application/use-cases/production-cycle/CreateProductionCycleUseCase';
import { UpdateProductionCycleUseCase } from '../../../application/use-cases/production-cycle/UpdateProductionCycleUseCase';
import { DeleteProductionCycleUseCase } from '../../../application/use-cases/production-cycle/DeleteProductionCycleUseCase';

export class ProductionCycleController {
  constructor(
    private readonly listUseCase: ListProductionCyclesUseCase,
    private readonly createUseCase: CreateProductionCycleUseCase,
    private readonly updateUseCase: UpdateProductionCycleUseCase,
    private readonly deleteUseCase: DeleteProductionCycleUseCase,
  ) {}

  /**
   * GET /production-units/:productionUnitId/cycles
   * List all cycles for a production unit with status (past, current, future).
   */
  async list(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { productionUnitId } = request.params;
    if (!productionUnitId) {
      throw AppError.badRequest('Missing productionUnitId', 'MISSING_PRODUCTION_UNIT_ID');
    }

    const result = await this.listUseCase.execute({ productionUnitId });

    return response.json({
      status: 'success',
      data: {
        productionUnitId: result.productionUnitId,
        productionUnitName: result.productionUnitName,
        cycles: result.cycles.map((cycle) => ({
          id: cycle.id,
          cropName: cycle.cropName,
          cropType: cycle.cropType,
          variety: cycle.variety,
          protocoll: cycle.protocoll,
          protectionStructure: cycle.protectionStructure,
          floweringDate: cycle.floweringDate,
          harvestingDate: cycle.harvestingDate,
          occupazione: cycle.occupazione,
          destinazioneDiUso: cycle.destinazioneDiUso,
          acquaTotalePeridoL: cycle.acquaTotalePeridoL,
          seasonYear: cycle.seasonYear,
          cycleIndex: cycle.cycleIndex,
          status: cycle.status,
          createdAt: cycle.createdAt,
          updatedAt: cycle.updatedAt,
        })),
        totalCycles: result.cycles.length,
      },
    });
  }

  /**
   * POST /production-units/:productionUnitId/cycles
   * Create a new cycle for a production unit.
   */
  async create(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { productionUnitId } = request.params;
    if (!productionUnitId) {
      throw AppError.badRequest('Missing productionUnitId', 'MISSING_PRODUCTION_UNIT_ID');
    }

    const body = request.body as {
      cropName: string;
      cropType: string;
      variety: string;
      protocoll: string;
      protectionStructure: string;
      floweringDate: string;
      harvestingDate: string;
      occupazione?: string | null;
      destinazioneDiUso?: string | null;
      acquaTotalePeridoL: number;
      seasonYear?: number;
      cycleIndex?: number;
    };

    if (
      !body.cropName ||
      !body.cropType ||
      !body.variety ||
      !body.protocoll ||
      !body.protectionStructure ||
      !body.floweringDate ||
      !body.harvestingDate
    ) {
      throw AppError.badRequest(
        'Missing required fields: cropName, cropType, variety, protocoll, protectionStructure, floweringDate, harvestingDate',
        'MISSING_REQUIRED_FIELDS',
      );
    }

    const { cycle } = await this.createUseCase.execute({
      productionUnitId,
      cropName: body.cropName,
      cropType: body.cropType,
      variety: body.variety,
      protocoll: body.protocoll,
      protectionStructure: body.protectionStructure,
      floweringDate: new Date(body.floweringDate),
      harvestingDate: new Date(body.harvestingDate),
      occupazione: body.occupazione,
      destinazioneDiUso: body.destinazioneDiUso,
      acquaTotalePeridoL: body.acquaTotalePeridoL ?? 0,
      seasonYear: body.seasonYear,
      cycleIndex: body.cycleIndex,
    });

    return response.status(201).json({
      status: 'success',
      data: { cycle },
    });
  }

  /**
   * PUT /production-units/:productionUnitId/cycles/:cycleId
   * Update an existing cycle.
   */
  async update(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { cycleId } = request.params;
    if (!cycleId) {
      throw AppError.badRequest('Missing cycleId', 'MISSING_CYCLE_ID');
    }

    const body = request.body as Partial<{
      cropName: string;
      cropType: string;
      variety: string;
      protocoll: string;
      protectionStructure: string;
      floweringDate: string;
      harvestingDate: string;
      occupazione: string | null;
      destinazioneDiUso: string | null;
      acquaTotalePeridoL: number;
      seasonYear: number;
      cycleIndex: number;
    }>;

    const data: Parameters<UpdateProductionCycleUseCase['execute']>[0]['data'] = {};
    if (body.cropName !== undefined) data.cropName = body.cropName;
    if (body.cropType !== undefined) data.cropType = body.cropType;
    if (body.variety !== undefined) data.variety = body.variety;
    if (body.protocoll !== undefined) data.protocoll = body.protocoll;
    if (body.protectionStructure !== undefined) data.protectionStructure = body.protectionStructure;
    if (body.floweringDate !== undefined) data.floweringDate = new Date(body.floweringDate);
    if (body.harvestingDate !== undefined) data.harvestingDate = new Date(body.harvestingDate);
    if (body.occupazione !== undefined) data.occupazione = body.occupazione;
    if (body.destinazioneDiUso !== undefined) data.destinazioneDiUso = body.destinazioneDiUso;
    if (body.acquaTotalePeridoL !== undefined) data.acquaTotalePeridoL = body.acquaTotalePeridoL;
    if (body.seasonYear !== undefined) data.seasonYear = body.seasonYear;
    if (body.cycleIndex !== undefined) data.cycleIndex = body.cycleIndex;

    const { cycle } = await this.updateUseCase.execute({
      cycleId,
      data,
    });

    return response.json({
      status: 'success',
      data: { cycle },
    });
  }

  /**
   * DELETE /production-units/:productionUnitId/cycles/:cycleId
   * Delete a cycle (cannot delete the last one).
   */
  async delete(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { cycleId } = request.params;
    if (!cycleId) {
      throw AppError.badRequest('Missing cycleId', 'MISSING_CYCLE_ID');
    }

    await this.deleteUseCase.execute(cycleId);

    return response.status(204).send();
  }
}
