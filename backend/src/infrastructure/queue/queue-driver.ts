import { requireAiEnabled } from '../runtime/aiCapabilities';
import { Queue as BullQueue, Worker as BullWorker, QueueEvents as BullQueueEvents } from 'bullmq';
import { PostgresQueue } from './postgres-queue';
import { PostgresWorker, PostgresQueueEvents } from './postgres-worker';
export type { Job } from 'bullmq';
// The compatibility boundary is deliberately confined here; processors retain their contracts.
const local = process.env.RUNTIME_PROFILE === 'desktop';
const SelectedQueue = local ? (PostgresQueue as unknown as typeof BullQueue) : BullQueue;
export class Queue extends SelectedQueue {
  constructor(...args: ConstructorParameters<typeof BullQueue>) {
    if (!['agent-stream-event-cleanup', 'qdc-sync', 'file-expiry-checker'].includes(args[0]))
      requireAiEnabled();
    super(...args);
  }
}
export const Worker = local ? (PostgresWorker as unknown as typeof BullWorker) : BullWorker;
export type Worker = BullWorker;
export const QueueEvents = local
  ? (PostgresQueueEvents as unknown as typeof BullQueueEvents)
  : BullQueueEvents;
export type QueueEvents = BullQueueEvents;
