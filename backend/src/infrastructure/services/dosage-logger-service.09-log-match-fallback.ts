import { DosageLogEventType } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogMatchFallback(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly mechanicalMatches: number;
    readonly unmatchedProducts: number;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
  }): void {
    const unitLabel = params.variety ? `${params.cropName} (${params.variety})` : params.cropName;
    const message = `${params.mechanicalMatches} prodotti compatibili, ${params.unmatchedProducts} da verificare per ${unitLabel}. Verifica semantica in corso...`;
    console.log(`[MATCH-FALLBACK] ${message}`);

    this.emitEvent({
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.MATCH_FALLBACK,
      message,
      metadata: {
        mechanicalMatches: params.mechanicalMatches,
        unmatchedProducts: params.unmatchedProducts,
        unitName: params.unitName,
        cropName: params.cropName,
        variety: params.variety,
      },
    });
  }
