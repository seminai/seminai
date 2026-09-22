import fs from 'fs';
import { AudioToTextError } from './audio-to-text-error';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceToBase64(this: AudioToTextServiceContext, audioFile: Buffer | string): string {
    if (Buffer.isBuffer(audioFile)) {
      return audioFile.toString('base64');
    }
    if (!fs.existsSync(audioFile)) {
      throw new AudioToTextError(`File audio non trovato: ${audioFile}`);
    }
    return fs.readFileSync(audioFile).toString('base64');
  }
