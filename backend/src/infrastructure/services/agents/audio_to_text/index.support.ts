import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';


export const usageLogger = LlmUsageLogger.getInstance();


export interface AudioToTextOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  temperature?: number;
}


export interface TranscriptionParams {
  audioFile: Buffer | string;
  fileName: string;
  prompt?: string;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}


export interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}


export interface AudioContentPart {
  readonly type: 'input_audio';
  readonly input_audio: {
    readonly data: string;
    readonly format: string;
  };
}


export interface TextContentPart {
  readonly type: 'text';
  readonly text: string;
}


export interface OpenRouterChatCompletionResponse {
  readonly choices?: Array<{
    readonly message?: {
      readonly content?: string;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
    readonly total_tokens?: number;
    readonly prompt_tokens_details?: { readonly cached_tokens?: number };
  };
}


export const EXTENSION_TO_FORMAT: Readonly<Record<string, string>> = {
  '.mp3': 'mp3',
  '.mpga': 'mp3',
  '.mpeg': 'mp3',
  '.mp4': 'mp4',
  '.m4a': 'm4a',
  '.wav': 'wav',
  '.webm': 'webm',
  '.ogg': 'ogg',
};


export const ALLOWED_EXTENSIONS = Object.keys(EXTENSION_TO_FORMAT);

export const TRANSCRIPTION_TIMEOUT_MS = 60000;

export const DEFAULT_TRANSCRIPTION_PROMPT =
  'Trascrivi letteralmente in italiano il contenuto di questo audio. Restituisci solo il testo trascritto, senza commenti, intestazioni o note aggiuntive.';
