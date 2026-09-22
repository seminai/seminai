import { Request, Response } from 'express';
import { AppError } from '../../../domain/errors/AppError';
import { createAudioToTextService, AudioToTextService } from '../../services/agents/audio_to_text';
import { MulterFile } from '../../services/Multer';

/**
 * Controller for audio to text transcription operations.
 * Exposes the AudioToTextService via HTTP endpoints.
 */
export class AudioToTextController {
  private audioToTextService: AudioToTextService;

  constructor() {
    this.audioToTextService = createAudioToTextService();
  }

  /**
   * Transcribe an audio file to text.
   * POST /audio-to-text/transcribe
   */
  async transcribe(req: Request, res: Response): Promise<Response> {
    const file = req.file as MulterFile | undefined;

    if (!file) {
      throw AppError.badRequest('Audio file is required', 'MISSING_AUDIO_FILE');
    }

    const { prompt, responseFormat, postProcess } = req.body as {
      prompt?: string;
      responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
      postProcess?: string;
    };

    try {
      if (postProcess === 'true' || postProcess === '1') {
        const postProcessPrompt = this.audioToTextService.createStandardItalianPrompt(
          'Trascrizione audio per applicazione agricola',
        );

        const result = await this.audioToTextService.convertAudioToTextWithProcessing(
          {
            audioFile: file.buffer,
            fileName: file.originalname,
            prompt,
            responseFormat,
          },
          postProcessPrompt,
        );

        return res.status(200).json({
          status: 'success',
          data: result,
        });
      }

      const result = await this.audioToTextService.convertAudioToText({
        audioFile: file.buffer,
        fileName: file.originalname,
        prompt,
        responseFormat,
      });

      return res.status(200).json({
        status: 'success',
        data: result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw AppError.internal(`Failed to transcribe audio: ${errorMessage}`, 'TRANSCRIPTION_ERROR');
    }
  }
}
