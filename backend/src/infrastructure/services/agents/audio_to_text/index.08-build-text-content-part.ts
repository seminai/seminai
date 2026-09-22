import { TextContentPart } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceBuildTextContentPart(this: AudioToTextServiceContext, text: string): TextContentPart {
    return { type: 'text', text };
  }
