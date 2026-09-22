import { DosageLogEventType, LLMMatchLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogLLMMatch(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly productName: string;
    readonly cropName: string;
    readonly compatible: boolean;
    readonly confidence: number;
    readonly reason?: string;
  }): void {
    const message = params.compatible
      ? `Prodotto "${params.productName}" compatibile con "${params.cropName}" (affidabilità: ${params.confidence}%)`
      : `Prodotto "${params.productName}" non compatibile con "${params.cropName}" (affidabilità: ${params.confidence}%)`;
    console.log(`[LLM-MATCH] ${message}`);
    if (params.reason) {
      console.log(`[LLM-MATCH] Reason: ${params.reason}`);
    }

    const event: LLMMatchLogEvent = {
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.LLM_MATCH,
      message,
      metadata: {
        productName: params.productName,
        cropName: params.cropName,
        compatible: params.compatible,
        confidence: params.confidence,
        reason: params.reason,
      },
    };
    this.emitEvent(event);
  }
