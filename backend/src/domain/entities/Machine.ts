import { randomUUID } from 'node:crypto';
import { Machine as PrismaMachine } from '@prisma/client';

/**
 * Machine domain entity representing a company machine.
 */
export class Machine {
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly identifier: string,
    public readonly lastPositiveRevisionDate: Date | null,
    public readonly functionalControlDate: Date | null,
    public readonly calibrationDate: Date | null,
    public readonly revisionReminderDays: number | null,
    public readonly calibrationReminderDays: number | null,
    public readonly functionalControlReminderDays: number | null,
    public readonly companyId: string,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
  ) {}

  /**
   * Factory method to create a new Machine with generated id and timestamps.
   */
  static create(props: Omit<PrismaMachine, 'id' | 'createdAt' | 'updatedAt'>): Machine {
    return new Machine(
      randomUUID(),
      props.name,
      props.identifier,
      props.lastPositiveRevisionDate ?? null,
      props.functionalControlDate ?? null,
      props.calibrationDate ?? null,
      props.revisionReminderDays ?? null,
      props.calibrationReminderDays ?? null,
      props.functionalControlReminderDays ?? null,
      props.companyId,
      new Date(),
      new Date(),
    );
  }

  /**
   * Builds a Machine domain entity from a Prisma Machine record.
   */
  static fromPrisma(prismaMachine: PrismaMachine): Machine {
    return new Machine(
      prismaMachine.id,
      prismaMachine.name,
      prismaMachine.identifier,
      prismaMachine.lastPositiveRevisionDate,
      prismaMachine.functionalControlDate,
      prismaMachine.calibrationDate,
      prismaMachine.revisionReminderDays,
      prismaMachine.calibrationReminderDays,
      prismaMachine.functionalControlReminderDays,
      prismaMachine.companyId,
      prismaMachine.createdAt,
      prismaMachine.updatedAt,
    );
  }
}
