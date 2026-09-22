import type { ChatOpenAI } from '@langchain/openai';
import fs from 'fs';
import axios from 'axios';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { createChatModel } from '../../llm-model-factory';
import {
  resolveAudioModelName,
  resolveGatewayConfig,
  type ResolvedGatewayConfig,
} from '../../llm-config';
import { buildOpenRouterHeaders } from '../../llm-gateway-headers';

const usageLogger = LlmUsageLogger.getInstance();

interface AudioToTextOptions {
  apiKey?: string;
  model?: string;
  language?: string;
  temperature?: number;
}

interface TranscriptionParams {
  audioFile: Buffer | string;
  fileName: string;
  prompt?: string;
  responseFormat?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}

interface TranscriptionResult {
  text: string;
  language?: string;
  duration?: number;
  segments?: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}

interface AudioContentPart {
  readonly type: 'input_audio';
  readonly input_audio: {
    readonly data: string;
    readonly format: string;
  };
}

interface TextContentPart {
  readonly type: 'text';
  readonly text: string;
}

interface OpenRouterChatCompletionResponse {
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

const EXTENSION_TO_FORMAT: Readonly<Record<string, string>> = {
  '.mp3': 'mp3',
  '.mpga': 'mp3',
  '.mpeg': 'mp3',
  '.mp4': 'mp4',
  '.m4a': 'm4a',
  '.wav': 'wav',
  '.webm': 'webm',
  '.ogg': 'ogg',
};

const ALLOWED_EXTENSIONS = Object.keys(EXTENSION_TO_FORMAT);
const TRANSCRIPTION_TIMEOUT_MS = 60000;
const DEFAULT_TRANSCRIPTION_PROMPT =
  'Trascrivi letteralmente in italiano il contenuto di questo audio. Restituisci solo il testo trascritto, senza commenti, intestazioni o note aggiuntive.';

class AudioToTextError extends Error {
  constructor(
    message: string,
    public cause?: Error,
  ) {
    super(message);
    this.name = 'AudioToTextError';
  }
}

/**
 * Servizio per la conversione da audio a testo.
 * Utilizza modelli multimodali via OpenRouter (POST /chat/completions con `input_audio` content part).
 */
export class AudioToTextService {
  private readonly gatewayConfig: ResolvedGatewayConfig;
  private readonly model: string;
  private readonly language: string;
  private readonly temperature: number;
  private readonly llm: ChatOpenAI;
  private readonly postProcessModelName: string;

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

  async convertAudioToTextWithProcessing(
    params: TranscriptionParams,
    postProcessPrompt?: string,
  ): Promise<TranscriptionResult> {
    try {
      const transcriptionResult = await this.convertAudioToText(params);

      if (!postProcessPrompt) {
        return transcriptionResult;
      }

      const processedText = await this.postProcessWithLLM(
        transcriptionResult.text,
        postProcessPrompt,
      );

      return {
        ...transcriptionResult,
        text: processedText,
      };
    } catch (error) {
      throw this.handleTranscriptionError(error);
    }
  }

  private async postProcessWithLLM(text: string, prompt: string): Promise<string> {
    try {
      const fullPrompt = `${prompt}\n\nTesto trascritto:\n${text}`;

      const usageAccumulator = new UsageAccumulator();
      const usageCollector = new LangChainUsageCollector(usageAccumulator);
      const response = await this.llm.invoke(fullPrompt, { callbacks: [usageCollector] });

      usageLogger
        .logFromAccumulator(usageAccumulator, {
          jobType: LlmJobType.AUDIO_TRANSCRIPTION,
          model: this.postProcessModelName,
          metadata: { step: 'audio-to-text-postprocess' },
        })
        .catch((err) => console.warn('[AUDIO-TO-TEXT] Failed to log usage:', err));

      return response.content.toString();
    } catch (error) {
      console.warn('Errore durante il post-processing con LLM:', error);
      return text;
    }
  }

  private validateAudioFile(audioFile: Buffer | string, fileName: string): void {
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

  private toBase64(audioFile: Buffer | string): string {
    if (Buffer.isBuffer(audioFile)) {
      return audioFile.toString('base64');
    }
    if (!fs.existsSync(audioFile)) {
      throw new AudioToTextError(`File audio non trovato: ${audioFile}`);
    }
    return fs.readFileSync(audioFile).toString('base64');
  }

  private resolveAudioFormat(fileName: string): string {
    const ext = fileName.toLowerCase().substring(fileName.lastIndexOf('.'));
    return EXTENSION_TO_FORMAT[ext] || 'wav';
  }

  private buildAudioContentPart(base64: string, format: string): AudioContentPart {
    return {
      type: 'input_audio',
      input_audio: { data: base64, format },
    };
  }

  private buildTextContentPart(text: string): TextContentPart {
    return { type: 'text', text };
  }

  private buildRequestHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.gatewayConfig.apiKey}`,
    };
    if (this.gatewayConfig.gateway === 'openrouter') {
      Object.assign(
        headers,
        buildOpenRouterHeaders(this.gatewayConfig.referer, this.gatewayConfig.title),
      );
    }
    return headers;
  }

  private logTranscriptionUsage(data: OpenRouterChatCompletionResponse): void {
    if (!data.usage) return;
    const promptTokens = data.usage.prompt_tokens ?? 0;
    const completionTokens = data.usage.completion_tokens ?? 0;
    const totalTokens = data.usage.total_tokens ?? promptTokens + completionTokens;
    const cachedPromptTokens = data.usage.prompt_tokens_details?.cached_tokens ?? 0;
    usageLogger
      .logFromUsage(
        { promptTokens, completionTokens, totalTokens, cachedPromptTokens },
        {
          jobType: LlmJobType.AUDIO_TRANSCRIPTION,
          model: this.model,
          metadata: { step: 'audio-to-text-transcribe' },
        },
      )
      .catch((err) => console.warn('[AUDIO-TO-TEXT] Failed to log usage:', err));
  }

  private processTranscriptionResponse(
    data: OpenRouterChatCompletionResponse,
  ): TranscriptionResult {
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    return {
      text,
      language: this.language,
    };
  }

  private handleTranscriptionError(error: unknown): AudioToTextError {
    if (error instanceof AudioToTextError) {
      return error;
    }

    if (axios.isAxiosError(error) && error.response) {
      const status = error.response.status;
      const responseData = error.response.data as
        | { error?: { message?: string }; message?: string }
        | undefined;
      const message =
        responseData?.error?.message || responseData?.message || 'Errore durante la trascrizione';
      const cause = error instanceof Error ? error : undefined;

      switch (status) {
        case 400:
          return new AudioToTextError(`Richiesta non valida: ${message}`, cause);
        case 401:
          return new AudioToTextError('API key non valida o mancante', cause);
        case 402:
          return new AudioToTextError('Credito OpenRouter insufficiente', cause);
        case 403:
          return new AudioToTextError('Accesso negato dal provider OpenRouter', cause);
        case 413:
          return new AudioToTextError('File audio troppo grande', cause);
        case 429:
          return new AudioToTextError('Limite di rate raggiunto, riprova più tardi', cause);
        case 500:
          return new AudioToTextError('Errore interno del provider OpenRouter', cause);
        default:
          return new AudioToTextError(`Errore HTTP ${status}: ${message}`, cause);
      }
    }

    if (axios.isAxiosError(error)) {
      if (error.code === 'ENOTFOUND') {
        return new AudioToTextError("Errore di connessione all'API OpenRouter", error);
      }
      if (error.code === 'ECONNABORTED') {
        return new AudioToTextError('Timeout durante la trascrizione', error);
      }
    }

    const fallback = error instanceof Error ? error : new Error(String(error));
    return new AudioToTextError(`Errore sconosciuto: ${fallback.message}`, fallback);
  }

  createStandardItalianPrompt(context?: string): string {
    const basePrompt = `Sei un assistente AI specializzato nel miglioramento di trascrizioni audio in italiano.
Il tuo compito è correggere errori di trascrizione, migliorare la punteggiatura e rendere il testo più leggibile mantenendo il significato originale.

Linee guida:
- Correggi errori grammaticali e di ortografia
- Migliora la punteggiatura
- Mantieni il tono e lo stile originale
- Non aggiungere informazioni non presenti nel testo originale
- Restituisci solo il testo corretto senza commenti aggiuntivi`;

    return context ? `${basePrompt}\n\nContesto: ${context}` : basePrompt;
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
  const fileName = audioFilePath.split('/').pop() || 'audio.mp3';

  const result = await service.convertAudioToText({
    audioFile: audioFilePath,
    fileName,
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
    {
      audioFile: audioBuffer,
      fileName,
    },
    prompt,
  );

  return result.text;
}
