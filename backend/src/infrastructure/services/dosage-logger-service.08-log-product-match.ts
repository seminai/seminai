import { DosageLogEventType, ProductMatchLogEvent } from '../../domain/dtos/dosage-log-event.dto';
import type { DosageLoggerServiceContext } from './dosage-logger-service.context';

export function dosageLoggerServiceLogProductMatch(this: DosageLoggerServiceContext, params: {
    readonly jobId: string;
    readonly userId: string;
    readonly productName: string;
    readonly productId: string;
    readonly unitName: string;
    readonly cropName: string;
    readonly variety?: string;
    readonly quantity: number;
  }): void {
    const unitLabel = params.variety ? `${params.cropName} (${params.variety})` : params.cropName;
    const message = `Prodotto "${params.productName}" compatibile con ${unitLabel} - quantità: ${params.quantity}`;
    console.log(`[MATCH] ${message}`);

    const event: ProductMatchLogEvent = {
      jobId: params.jobId,
      userId: params.userId,
      timestamp: new Date(),
      type: DosageLogEventType.MATCH,
      message,
      metadata: {
        productName: params.productName,
        productId: params.productId,
        unitName: params.unitName,
        cropName: params.cropName,
        variety: params.variety,
        quantity: params.quantity,
      },
    };
    this.emitEvent(event);
  }
