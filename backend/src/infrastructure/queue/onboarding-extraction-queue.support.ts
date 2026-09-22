import { type ExtractionResult, type ExtractionPhase } from '../../application/use-cases/onboarding/ExtractFromFileUseCase';
import { getGlobalSocketIO } from '../services/agents/dosage_agent_react/socket/chat-socket-emitter';


export const QUEUE_NAME = 'onboarding-extraction';

export const LOCK_DURATION_MS = 1_200_000;
 // 20 min
export const LOCK_RENEW_TIME_MS = 180_000;
 // 3 min
export const STALLED_INTERVAL_MS = 180_000;
 // 3 min
export const JOB_TIMEOUT_MS = 900_000;
 // 15 min

export interface OnboardingExtractionJobData {
  fileBuffer: Buffer | { type: 'Buffer'; data: number[] };
  originalName: string;
  mimeType: string;
  userId: string;
}


export interface OnboardingExtractionJobResult extends ExtractionResult {
  status: 'completed' | 'failed';
}


export interface OnboardingExtractionProgress {
  readonly version: 1;
  readonly phase: ExtractionPhase;
  readonly progress: number;
  readonly message: string;
  readonly updatedAt: string;
}


export function emitSocketProgress(jobId: string, payload: OnboardingExtractionProgress): void {
  const io = getGlobalSocketIO();
  if (!io) return;
  const room = `job:${jobId}`;
  io.to(room).emit('extraction:progress', payload);
}


export function emitSocketCompleted(jobId: string): void {
  const io = getGlobalSocketIO();
  if (!io) return;
  io.to(`job:${jobId}`).emit('extraction:completed', {
    version: 1,
    jobId,
    resultReady: true,
  });
}


export function emitSocketFailed(jobId: string, errorCode: string, message: string): void {
  const io = getGlobalSocketIO();
  if (!io) return;
  io.to(`job:${jobId}`).emit('extraction:failed', {
    version: 1,
    jobId,
    errorCode,
    message,
  });
}
