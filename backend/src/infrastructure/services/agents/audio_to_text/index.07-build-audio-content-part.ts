import { AudioContentPart } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceBuildAudioContentPart(this: AudioToTextServiceContext, base64: string, format: string): AudioContentPart {
    return {
      type: 'input_audio',
      input_audio: { data: base64, format },
    };
  }
