import { EXTENSION_TO_FORMAT } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceResolveAudioFormat(this: AudioToTextServiceContext, fileName: string): string {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return EXTENSION_TO_FORMAT[ext] || 'wav';
  }
