import { AudioToTextError } from './audio-to-text-error';
import { ALLOWED_EXTENSIONS } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export function audioToTextServiceValidateAudioFile(this: AudioToTextServiceContext, audioFile: Buffer | string, fileName: string): void {
    const fileExtension = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));

    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      throw new AudioToTextError(
        `Formato file non supportato: ${fileExtension}. Formati supportati: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    if (Buffer.isBuffer(audioFile) && audioFile.length === 0) {
      throw new AudioToTextError('Il file audio è vuoto');
    }
  }
