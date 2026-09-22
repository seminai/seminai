import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export async function audioToTextServicePostProcessWithLLM(this: AudioToTextServiceContext, text: string, prompt: string): Promise<string> {
    try {
      const fullPrompt = `${prompt}\n\nTesto trascritto:\n${text}`;

      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const response = await this.llm.invoke(fullPrompt, { callbacks: [usageCollector] });

      usageLogger
        .logFromAccumulator(usageAccumulator, {
          jobType: LlmJobType.AUDIO_TRANSCRIPTION,
          model: this.postProcessModelName,
          metadata: { step: 'audio-to-text-postprocess' },
        })
        .catch((err) => console.warn('[AUDIO-TO-TEXT] Failed to log usage:', err));

      return response.content.toString();
    } catch (error) {
      console.warn('Errore durante il post-processing con LLM:', error);
      return text;
    }
  }
