import { getGlobalSocketIO } from '../agents/dosage_agent_react/socket/chat-socket-emitter';
import type { BatchExtractionOrchestratorContext } from './batch-extraction-orchestrator.context';

export async function batchExtractionOrchestratorMaybeEmitBatchDone(this: BatchExtractionOrchestratorContext, batchId: string): Promise<void> {
    const records = await this.fileExtractionRepository.findByBatchId(batchId);
    const stillLoading = records.some((r) => r.status === 'LOADING');
    if (stillLoading) return;
    const io = getGlobalSocketIO();
    io?.to(`extraction:${batchId}`).emit('extraction:done', { batchId });
  }
