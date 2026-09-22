import type { ChatOpenAI } from '@langchain/openai';
import { createChatModel } from '../../llm-model-factory';
import { resolveAudioModelName, resolveGatewayConfig, type ResolvedGatewayConfig } from '../../llm-config';
import { AudioToTextError } from './audio-to-text-error';
import { AudioToTextOptions, TranscriptionParams, TranscriptionResult, AudioContentPart, TextContentPart, OpenRouterChatCompletionResponse } from './index.support';
import type { AudioToTextServiceContext } from './index.context';
import { audioToTextServiceConvertAudioToText } from './index.01-convert-audio-to-text';
import { audioToTextServiceConvertAudioToTextWithProcessing } from './index.02-convert-audio-to-text-with-processing';
import { audioToTextServicePostProcessWithLLM } from './index.03-post-process-with-llm';
import { audioToTextServiceValidateAudioFile } from './index.04-validate-audio-file';
import { audioToTextServiceToBase64 } from './index.05-to-base64';
import { audioToTextServiceResolveAudioFormat } from './index.06-resolve-audio-format';
import { audioToTextServiceBuildAudioContentPart } from './index.07-build-audio-content-part';
import { audioToTextServiceBuildTextContentPart } from './index.08-build-text-content-part';
import { audioToTextServiceBuildRequestHeaders } from './index.09-build-request-headers';
import { audioToTextServiceLogTranscriptionUsage } from './index.10-log-transcription-usage';
import { audioToTextServiceProcessTranscriptionResponse } from './index.11-process-transcription-response';
import { audioToTextServiceHandleTranscriptionError } from './index.12-handle-transcription-error';
import { audioToTextServiceCreateStandardItalianPrompt } from './index.13-create-standard-italian-prompt';


/**
 * Servizio per la conversione da audio a testo.
 * Utilizza modelli multimodali via OpenRouter (POST /chat/completions con `input_audio` content part).
 */
export class AudioToTextService {

  readonly gatewayConfig: ResolvedGatewayConfig;
  readonly model: string;
  readonly language: string;
  readonly temperature: number;
  readonly llm: ChatOpenAI;
  readonly postProcessModelName: string;

  constructor(options: AudioToTextOptions = {}) {
    this.gatewayConfig = options.apiKey
      ? { ...resolveGatewayConfig(), apiKey: options.apiKey }
      : resolveGatewayConfig();
    this.model = options.model || resolveAudioModelName();
    this.language = options.language || 'it';
    this.temperature = options.temperature ?? 0;

    if (!this.gatewayConfig.apiKey) {
      throw new AudioToTextError('LLM gateway API key è richiesta');
    }

    const created = createChatModel({
      modelName: 'gpt-4o-mini',
      temperature: this.temperature,
    });
    this.llm = created.model;
    this.postProcessModelName = created.modelName;
  }

  async convertAudioToText(params: TranscriptionParams): Promise<TranscriptionResult> {
    return audioToTextServiceConvertAudioToText.call(this as unknown as AudioToTextServiceContext, params);
  }

  async convertAudioToTextWithProcessing(
    params: TranscriptionParams,
    postProcessPrompt?: string,
  ): Promise<TranscriptionResult> {
    return audioToTextServiceConvertAudioToTextWithProcessing.call(this as unknown as AudioToTextServiceContext, params, postProcessPrompt);
  }

  async postProcessWithLLM(text: string, prompt: string): Promise<string> {
    return audioToTextServicePostProcessWithLLM.call(this as unknown as AudioToTextServiceContext, text, prompt);
  }

  validateAudioFile(audioFile: Buffer | string, fileName: string): void {
    audioToTextServiceValidateAudioFile.call(this as unknown as AudioToTextServiceContext, audioFile, fileName);
  }

  toBase64(audioFile: Buffer | string): string {
    return audioToTextServiceToBase64.call(this as unknown as AudioToTextServiceContext, audioFile);
  }

  resolveAudioFormat(fileName: string): string {
    return audioToTextServiceResolveAudioFormat.call(this as unknown as AudioToTextServiceContext, fileName);
  }

  buildAudioContentPart(base64: string, format: string): AudioContentPart {
    return audioToTextServiceBuildAudioContentPart.call(this as unknown as AudioToTextServiceContext, base64, format);
  }

  buildTextContentPart(text: string): TextContentPart {
    return audioToTextServiceBuildTextContentPart.call(this as unknown as AudioToTextServiceContext, text);
  }

  buildRequestHeaders(): Record<string, string> {
    return audioToTextServiceBuildRequestHeaders.call(this as unknown as AudioToTextServiceContext);
  }

  logTranscriptionUsage(data: OpenRouterChatCompletionResponse): void {
    audioToTextServiceLogTranscriptionUsage.call(this as unknown as AudioToTextServiceContext, data);
  }

  processTranscriptionResponse(
    data: OpenRouterChatCompletionResponse,
  ): TranscriptionResult {
    return audioToTextServiceProcessTranscriptionResponse.call(this as unknown as AudioToTextServiceContext, data);
  }

  handleTranscriptionError(error: unknown): AudioToTextError {
    return audioToTextServiceHandleTranscriptionError.call(this as unknown as AudioToTextServiceContext, error);
  }

  createStandardItalianPrompt(context?: string): string {
    return audioToTextServiceCreateStandardItalianPrompt.call(this as unknown as AudioToTextServiceContext, context);
  }
}

export function createAudioToTextService(options?: AudioToTextOptions): AudioToTextService {
  return new AudioToTextService(options);
}

export async function convertAudioFileToText(
  audioFilePath: string,
  options?: AudioToTextOptions,
): Promise<string> {
  const service = createAudioToTextService(options);
  const result = await service.convertAudioToText({
    audioFile: audioFilePath,
    fileName: audioFilePath.split('/').pop() || 'audio.mp3',
  });
  return result.text;
}

export async function convertAudioBufferToTextWithProcessing(
  audioBuffer: Buffer,
  fileName: string,
  options?: AudioToTextOptions,
): Promise<string> {
  const service = createAudioToTextService(options);
  const prompt = service.createStandardItalianPrompt('Trascrizione audio per assistente agricolo');
  const result = await service.convertAudioToTextWithProcessing(
    { audioFile: audioBuffer, fileName },
    prompt,
  );
  return result.text;
}
