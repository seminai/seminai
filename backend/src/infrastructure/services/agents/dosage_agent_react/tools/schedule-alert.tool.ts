/**
 * Tool: schedule_alert
 * Schedules a proactive alert for the agronomist.
 * Creates a DB trigger AND a BullMQ delayed job for precise timing.
 */
import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { OuterLoopService } from '../outer-loop/outer-loop.service';
import { getOuterLoopProcessorQueue } from '../../../../queue/OuterLoopProcessorQueue';

const ALERT_TYPES = [
  'phenological',
  'stock_alert',
  'treatment_window',
  'conformity_reminder',
  'file_expiry',
] as const;

/**
 * Creates the schedule_alert tool for the given user and thread.
 * @param userId - Current user ID (from context discovery)
 * @param threadId - Current thread ID (for Socket.IO push on trigger fire)
 * @returns A DynamicStructuredTool instance
 */
export function createScheduleAlertTool(userId: string, threadId?: string): DynamicStructuredTool {
  const service = new OuterLoopService();
  return new DynamicStructuredTool({
    name: 'schedule_alert',
    description:
      "Schedula un alert proattivo per l'agronomo. Tipi: phenological (fase coltura), stock_alert (scorte sotto soglia), treatment_window (finestra trattamento), conformity_reminder (promemoria conformità).",
    schema: z.object({
      type: z.enum(ALERT_TYPES).describe('Tipo di alert da schedulare'),
      title: z.string().describe("Titolo dell'alert"),
      payload: z
        .record(z.string(), z.unknown())
        .optional()
        .default({})
        .describe('Dati aggiuntivi (es. fieldId, productId)'),
      scheduledAt: z.string().describe('Data e ora in formato ISO 8601 (es. 2026-03-10T08:00:00Z)'),
    }),
    func: async ({ type, title, payload, scheduledAt }) => {
      try {
        const scheduledDate = new Date(scheduledAt);
        if (Number.isNaN(scheduledDate.getTime())) {
          return JSON.stringify({
            ok: false,
            error: 'scheduledAt non è una data ISO valida',
          });
        }
        const trigger = await service.scheduleAlert({
          userId,
          type,
          title,
          payload: payload ?? {},
          scheduledAt: scheduledDate,
          threadId,
        });
        const delayMs = Math.max(0, scheduledDate.getTime() - Date.now());
        await enqueueDelayedTrigger(trigger.id, delayMs);
        return JSON.stringify({
          ok: true,
          triggerId: trigger.id,
          message: `Alert "${title}" schedulato per il ${scheduledDate.toISOString()}`,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Errore sconosciuto';
        return JSON.stringify({ ok: false, error: msg });
      }
    },
  });
}

/**
 * Enqueues a BullMQ delayed job so the trigger fires at the exact scheduled time.
 * Falls back to the 5-min polling cycle if enqueue fails.
 */
async function enqueueDelayedTrigger(triggerId: string, delayMs: number): Promise<void> {
  try {
    const queue = getOuterLoopProcessorQueue();
    await queue.queue.add(
      'execute-trigger',
      { triggerId },
      {
        delay: delayMs,
        removeOnComplete: { age: 3600 },
        removeOnFail: { age: 7200 },
        jobId: `trigger-${triggerId}`,
      },
    );
  } catch (error) {
    console.warn('[schedule-alert] Failed to enqueue delayed job, falling back to polling:', error);
  }
}
