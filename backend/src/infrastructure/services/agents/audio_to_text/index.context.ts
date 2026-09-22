import type { ChatOpenAI } from '@langchain/openai';
import { type ResolvedGatewayConfig } from '../../llm-config';
import { AudioToTextError } from './audio-to-text-error';
import { TranscriptionParams, TranscriptionResult, AudioContentPart, TextContentPart, OpenRouterChatCompletionResponse } from './index.support';

export interface AudioToTextServiceContext {
  readonly gatewayConfig: ResolvedGatewayConfig;
  readonly model: string;
  readonly language: string;
  readonly temperature: number;
  readonly llm: ChatOpenAI;
  readonly postProcessModelName: string;
  convertAudioToText(params: TranscriptionParams): Promise<TranscriptionResult>;
  convertAudioToTextWithProcessing(params: TranscriptionParams, postProcessPrompt?: string): Promise<TranscriptionResult>;
  postProcessWithLLM(text: string, prompt: string): Promise<string>;
  validateAudioFile(audioFile: Buffer | string, fileName: string): void;
  toBase64(audioFile: Buffer | string): string;
  resolveAudioFormat(fileName: string): string;
  buildAudioContentPart(base64: string, format: string): AudioContentPart;
  buildTextContentPart(text: string): TextContentPart;
  buildRequestHeaders(): Record<string, string>;
  logTranscriptionUsage(data: OpenRouterChatCompletionResponse): void;
  processTranscriptionResponse(data: OpenRouterChatCompletionResponse): TranscriptionResult;
  handleTranscriptionError(error: unknown): AudioToTextError;
  createStandardItalianPrompt(context?: string): string;
}
