/**
 * Outer Loop Service — manages proactive alerts for the agronomist agent.
 * Handles scheduling, execution, and lifecycle of async triggers stored in DB.
 */
import type { OuterLoopTrigger } from '@prisma/client';
import { prisma as defaultPrisma } from '../../../../repositories/Prisma';
import { AppError } from '../../../../../domain/errors/AppError';

/** Minimal Prisma delegate interface for testing. */
export interface OuterLoopPrismaDelegate {
  readonly outerLoopTrigger: {
    create(args: unknown): Promise<OuterLoopTrigger>;
    findUnique(args: unknown): Promise<{ id: string; userId: string } | null>;
    update(args: unknown): Promise<OuterLoopTrigger>;
    findMany(args: unknown): Promise<OuterLoopTrigger[]>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
}

/** Parameters for scheduling a new alert. */
export interface ScheduleAlertParams {
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly payload: Record<string, unknown>;
  readonly scheduledAt: Date;
  readonly threadId?: string;
}

/** DTO for a trigger entry returned by the service. */
export interface TriggerEntry {
  readonly id: string;
  readonly userId: string;
  readonly type: string;
  readonly title: string;
  readonly payload: unknown;
  readonly scheduledAt: Date;
  readonly executedAt: Date | null;
  readonly status: string;
  readonly threadId: string | null;
}

/**
 * Service for managing Outer Loop triggers (proactive alerts).
 * Accepts an optional prisma delegate for testing.
 */
export class OuterLoopService {
  private readonly db: OuterLoopPrismaDelegate;

  constructor(db: OuterLoopPrismaDelegate = defaultPrisma) {
    this.db = db;
  }

  /**
   * Schedules a new alert. Creates an OuterLoopTrigger in DB with status 'pending'.
   * @param params - Alert parameters
   * @returns The created trigger entry
   */
  async scheduleAlert(params: ScheduleAlertParams): Promise<TriggerEntry> {
    const row = await this.db.outerLoopTrigger.create({
      data: {
        userId: params.userId,
        type: params.type,
        title: params.title,
        payload: params.payload as object,
        scheduledAt: params.scheduledAt,
        threadId: params.threadId ?? null,
        status: 'pending',
      },
    });
    return this.toEntry(row);
  }

  /**
   * Cancels an alert by setting its status to 'dismissed'.
   * @param triggerId - ID of the trigger to cancel
   */
  async cancelAlert(triggerId: string, userId: string): Promise<void> {
    const trigger = await this.db.outerLoopTrigger.findUnique({
      where: { id: triggerId },
      select: { id: true, userId: true },
    });
    if (!trigger) {
      throw AppError.notFound('Trigger not found', 'OUTER_LOOP_TRIGGER_NOT_FOUND');
    }
    if (trigger.userId !== userId) {
      throw AppError.forbidden(
        'Not authorized to manage this trigger',
        'OUTER_LOOP_TRIGGER_FORBIDDEN',
      );
    }
    await this.db.outerLoopTrigger.update({
      where: { id: triggerId },
      data: { status: 'dismissed' },
    });
  }

  /**
   * Marks an alert as executed: sets status to 'sent' and executedAt to now.
   * @param triggerId - ID of the trigger to execute
   * @returns The updated trigger entry
   */
  async executeAlert(triggerId: string): Promise<TriggerEntry> {
    const row = await this.db.outerLoopTrigger.update({
      where: { id: triggerId },
      data: { status: 'sent', executedAt: new Date() },
    });
    return this.toEntry(row);
  }

  /**
   * Lists all pending triggers for a user with scheduledAt <= now.
   * @param userId - User ID
   * @returns Readonly array of pending trigger entries
   */
  async listPendingTriggers(userId: string): Promise<readonly TriggerEntry[]> {
    const rows = await this.db.outerLoopTrigger.findMany({
      where: {
        userId,
        status: 'pending',
        scheduledAt: { lte: new Date() },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    return rows.map((r) => this.toEntry(r));
  }

  /**
   * Lists all triggers for a user, optionally filtered by status and limited.
   * @param userId - User ID
   * @param options - Optional filters: status, limit (default 50)
   * @returns Readonly array of trigger entries
   */
  async listAllTriggers(
    userId: string,
    options?: { status?: string; limit?: number },
  ): Promise<readonly TriggerEntry[]> {
    const limit = options?.limit ?? 50;
    const rows = await this.db.outerLoopTrigger.findMany({
      where: {
        userId,
        ...(options?.status ? { status: options.status } : {}),
      },
      orderBy: { scheduledAt: 'desc' },
      take: limit,
    });
    return rows.map((r) => this.toEntry(r));
  }

  /**
   * Deletes all triggers for a user.
   * @param userId - User ID
   * @returns Number of deleted triggers
   */
  async deleteTriggersForUser(userId: string): Promise<number> {
    const result = await this.db.outerLoopTrigger.deleteMany({
      where: { userId },
    });
    return result.count;
  }

  /** Maps a Prisma row to a TriggerEntry DTO. */
  private toEntry(row: OuterLoopTrigger): TriggerEntry {
    return {
      id: row.id,
      userId: row.userId,
      type: row.type,
      title: row.title,
      payload: row.payload,
      scheduledAt: row.scheduledAt,
      executedAt: row.executedAt,
      status: row.status,
      threadId: row.threadId,
    };
  }
}
