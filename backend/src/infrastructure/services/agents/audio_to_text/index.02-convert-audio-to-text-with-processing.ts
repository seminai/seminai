import { TranscriptionParams, TranscriptionResult } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export async function audioToTextServiceConvertAudioToTextWithProcessing(this: AudioToTextServiceContext, params: TranscriptionParams, postProcessPrompt?: string): Promise<TranscriptionResult> {
    try {
      const transcriptionResult = await this.convertAudioToText(params);

      if (!postProcessPrompt) {
        return transcriptionResult;
      }

      const processedText = await this.postProcessWithLLM(
        transcriptionResult.text,
        postProcessPrompt,
      );

      return {
        ...transcriptionResult,
        text: processedText,
      };
    } catch (error) {
      throw this.handleTranscriptionError(error);
    }
  }
