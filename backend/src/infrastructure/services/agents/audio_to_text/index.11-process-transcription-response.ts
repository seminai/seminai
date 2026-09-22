import { TranscriptionResult, OpenRouterChatCompletionResponse } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceProcessTranscriptionResponse(this: AudioToTextServiceContext, data: OpenRouterChatCompletionResponse): TranscriptionResult {
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return {
      text,
      language: this.language,
    };
  }
