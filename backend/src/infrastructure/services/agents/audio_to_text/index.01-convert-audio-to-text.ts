import axios from 'axios';
import { TranscriptionParams, TranscriptionResult, AudioContentPart, TextContentPart, OpenRouterChatCompletionResponse, TRANSCRIPTION_TIMEOUT_MS, DEFAULT_TRANSCRIPTION_PROMPT } from './index.support';
import type { AudioToTextServiceContext } from './index.context';

export async function audioToTextServiceConvertAudioToText(this: AudioToTextServiceContext, params: TranscriptionParams): Promise<TranscriptionResult> {
    try {
      this.validateAudioFile(params.audioFile, params.fileName);

      const audioBase64 = this.toBase64(params.audioFile);
      const format = this.resolveAudioFormat(params.fileName);
      const promptText = params.prompt || DEFAULT_TRANSCRIPTION_PROMPT;

      const requestBody = {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: [
              this.buildAudioContentPart(audioBase64, format),
              this.buildTextContentPart(promptText),
            ] as ReadonlyArray<AudioContentPart | TextContentPart>,
          },
        ],
        temperature: this.temperature,
      };

      const baseUrl = this.gatewayConfig.baseUrl?.replace(/\/+$/, '') || '';
      const url = `${baseUrl}/chat/completions`;

      const response = await axios.post<OpenRouterChatCompletionResponse>(url, requestBody, {
        headers: this.buildRequestHeaders(),
        timeout: TRANSCRIPTION_TIMEOUT_MS,
      });

      this.logTranscriptionUsage(response.data);
      return this.processTranscriptionResponse(response.data);
    } catch (error) {
      throw this.handleTranscriptionError(error);
    }
  }
