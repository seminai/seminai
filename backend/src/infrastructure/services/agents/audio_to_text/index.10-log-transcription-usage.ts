import { LlmJobType } from '@prisma/client';
import { usageLogger, OpenRouterChatCompletionResponse } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceLogTranscriptionUsage(this: AudioToTextServiceContext, data: OpenRouterChatCompletionResponse): void {
    if (!data.usage) return;
    const promptTokens = data.usage.prompt_tokens ?? 0;
    const completionTokens = data.usage.completion_tokens ?? 0;
    const totalTokens = data.usage.total_tokens ?? promptTokens + completionTokens;
    const cachedPromptTokens = data.usage.prompt_tokens_details?.cached_tokens ?? 0;
    usageLogger
      .logFromUsage(
        { promptTokens, completionTokens, totalTokens, cachedPromptTokens },
        {
          jobType: LlmJobType.AUDIO_TRANSCRIPTION,
          model: this.model,
          metadata: { step: 'audio-to-text-transcribe' },
        },
      )
      .catch((err) => console.warn('[AUDIO-TO-TEXT] Failed to log usage:', err));
  }
