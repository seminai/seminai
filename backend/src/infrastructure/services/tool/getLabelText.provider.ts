import { ILabelTextProvider } from '../../../domain/repositories/ILabelServices';
import { LabelTextResult } from '../../../domain/dtos/label.dto';
import { getLabelTextFromPdfUrl } from './getLabelDataFromPdfUrl';
import { DosageAgentContext } from '../agents/dosage_agent/context';

export class GetLabelTextProvider implements ILabelTextProvider {
  private context?: DosageAgentContext;

  setContext(context?: DosageAgentContext): void {
    this.context = context;
  }

  async getText(name: string, registrationNumber: string): Promise<LabelTextResult | null> {
    return getLabelTextFromPdfUrl(name, registrationNumber, this.context);
  }
}
