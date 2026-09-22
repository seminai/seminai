import { PrismaClient } from '@prisma/client';
import { Machine } from '../../domain/entities/Machine';
import { IMachineRepository } from '../../domain/repositories/IMachineRepository';

export class PrismaMachineRepository implements IMachineRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createMany(machines: Machine[]): Promise<void> {
    if (machines.length === 0) return;
    await this.prisma.machine.createMany({
      data: machines.map((machine) => ({
        id: machine.id,
        name: machine.name,
        identifier: machine.identifier,
        lastPositiveRevisionDate: machine.lastPositiveRevisionDate ?? undefined,
        functionalControlDate: machine.functionalControlDate ?? undefined,
        calibrationDate: machine.calibrationDate ?? undefined,
        revisionReminderDays: machine.revisionReminderDays ?? undefined,
        calibrationReminderDays: machine.calibrationReminderDays ?? undefined,
        functionalControlReminderDays: machine.functionalControlReminderDays ?? undefined,
        companyId: machine.companyId,
        createdAt: machine.createdAt,
        updatedAt: machine.updatedAt,
      })),
    });
  }

  async findById(id: string): Promise<Machine | null> {
    const found = await this.prisma.machine.findUnique({ where: { id } });
    if (!found) return null;
    return Machine.fromPrisma(found);
  }

  async findManyByCompanyId(companyId: string): Promise<Machine[]> {
    const list = await this.prisma.machine.findMany({ where: { companyId } });
    return list.map(Machine.fromPrisma);
  }

  async update(id: string, data: Partial<Machine>): Promise<Machine> {
    const updatableKeys = [
      'name',
      'identifier',
      'lastPositiveRevisionDate',
      'functionalControlDate',
      'calibrationDate',
      'revisionReminderDays',
      'calibrationReminderDays',
      'functionalControlReminderDays',
      'companyId',
    ] as const;
    const sanitizedData = updatableKeys.reduce<Record<string, unknown>>((acc, key) => {
      if (key in data && data[key] !== undefined) {
        acc[key] = data[key];
      }
      return acc;
    }, {});
    const updated = await this.prisma.machine.update({
      where: { id },
      data: sanitizedData,
    });
    return Machine.fromPrisma(updated);
  }

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await this.prisma.machine.deleteMany({ where: { id: { in: ids } } });
  }
}
