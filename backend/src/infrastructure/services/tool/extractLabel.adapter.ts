import { ILabelExtractor } from '../../../domain/repositories/ILabelServices';
import { Label } from '../../../domain/dtos/label.dto';
import { extractStructuredTreatmentData } from './extractDataFromLabel';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { DosageAgentContext } from '../agents/dosage_agent/context';

export class ExtractLabelAdapter implements ILabelExtractor {
  private context?: DosageAgentContext;

  setContext(context?: DosageAgentContext): void {
    this.context = context;
  }

  async extract(text: string, callbacks?: ReadonlyArray<BaseCallbackHandler>): Promise<Label> {
    return extractStructuredTreatmentData(text, callbacks, this.context);
  }
}
