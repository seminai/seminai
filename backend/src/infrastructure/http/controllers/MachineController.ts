import { Request, Response } from 'express';
import { IMachineRepository } from '../../../domain/repositories/IMachineRepository';
import { AppError } from '../../../domain/errors/AppError';
import { Machine } from '../../../domain/entities/Machine';

export class MachineController {
  constructor(private readonly machineRepository: IMachineRepository) {}

  async createMany(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { machines } = request.body;

    if (!Array.isArray(machines) || machines.length === 0) {
      throw AppError.badRequest(
        'Machines array is required and must not be empty',
        'MISSING_MACHINES',
      );
    }

    const toCreate = machines.map(
      (machine: {
        name: string;
        identifier: string;
        lastPositiveRevisionDate?: string | null;
        functionalControlDate?: string | null;
        calibrationDate?: string | null;
        revisionReminderDays?: number | null;
        calibrationReminderDays?: number | null;
        functionalControlReminderDays?: number | null;
        companyId: string;
      }) => {
        if (!machine.name || !machine.identifier || !machine.companyId) {
          throw AppError.badRequest(
            'Missing required fields: name, identifier, companyId',
            'MISSING_FIELDS',
          );
        }

        return Machine.create({
          name: machine.name,
          identifier: machine.identifier,
          lastPositiveRevisionDate: machine.lastPositiveRevisionDate
            ? new Date(machine.lastPositiveRevisionDate)
            : null,
          functionalControlDate: machine.functionalControlDate
            ? new Date(machine.functionalControlDate)
            : null,
          calibrationDate: machine.calibrationDate ? new Date(machine.calibrationDate) : null,
          revisionReminderDays: machine.revisionReminderDays ?? null,
          calibrationReminderDays: machine.calibrationReminderDays ?? null,
          functionalControlReminderDays: machine.functionalControlReminderDays ?? null,
          companyId: machine.companyId,
        });
      },
    );

    await this.machineRepository.createMany(toCreate);

    return response.status(201).json({
      status: 'success',
      data: { count: toCreate.length, machines: toCreate },
    });
  }

  async listByCompany(request: Request, response: Response): Promise<Response> {
    const { companyId } = request.params;

    if (!companyId) {
      throw AppError.badRequest('Company ID is required', 'MISSING_COMPANY_ID');
    }

    const list = await this.machineRepository.findManyByCompanyId(companyId);
    return response.json({ status: 'success', data: { machines: list } });
  }

  async update(request: Request, response: Response): Promise<Response> {
    const { id } = request.params;
    const updateData = request.body as Partial<Machine>;

    if (!id) {
      throw AppError.badRequest('Machine ID is required', 'MISSING_MACHINE_ID');
    }

    const existing = await this.machineRepository.findById(id);
    if (!existing) {
      throw AppError.notFound('Machine not found', 'MACHINE_NOT_FOUND');
    }

    const updated = await this.machineRepository.update(id, updateData);
    return response.json({ status: 'success', data: { machine: updated } });
  }

  async deleteMany(request: Request, response: Response): Promise<Response> {
    if (!request.user?.id) {
      throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
    }

    const { ids } = request.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      throw AppError.badRequest('Ids array is required and must not be empty', 'MISSING_IDS');
    }

    await this.machineRepository.deleteMany(ids);

    return response.status(204).send();
  }
}
