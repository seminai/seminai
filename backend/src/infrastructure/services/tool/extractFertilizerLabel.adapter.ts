import { FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';
import { extractStructuredFertilizerData } from './extractDataFromFertilizerLabel';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';

export class ExtractFertilizerLabelAdapter {
  async extract(
    text: string,
    callbacks?: ReadonlyArray<BaseCallbackHandler>,
  ): Promise<FertilizerLabel> {
    return extractStructuredFertilizerData(text, callbacks);
  }
}
