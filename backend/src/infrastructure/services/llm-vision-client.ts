import { resolveDefaultVisionModel, resolveChatModelConfig } from './llm-config';
import {
  fetchChatCompletion,
  parseChatCompletionResponse,
  type ChatCompletionContentPart,
  type ChatCompletionMessage,
} from './llm-chat-completion-client';

export interface VisionCompletionRequest {
  readonly model?: string;
  readonly messages: readonly ChatCompletionMessage[];
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly responseFormat?: { readonly type: 'json_object' | 'text' };
  readonly signal?: AbortSignal;
}

export interface VisionCompletionResult {
  readonly content: string;
  readonly model: string;
  readonly usage?: Record<string, unknown>;
}

export function buildImageContentPart(
  base64: string,
  mimeType: string,
  detail: 'auto' | 'low' | 'high' = 'high',
): ChatCompletionContentPart {
  return {
    type: 'image_url',
    image_url: {
      url: `data:${mimeType};base64,${base64}`,
      detail,
    },
  };
}

export async function fetchVisionCompletion(
  request: VisionCompletionRequest,
): Promise<VisionCompletionResult> {
  const model = request.model ?? resolveDefaultVisionModel();
  const config = resolveChatModelConfig(model);
  const response = await fetchChatCompletion({
    model,
    messages: request.messages,
    maxTokens: request.maxTokens,
    temperature: request.temperature,
    responseFormat: request.responseFormat,
    signal: request.signal,
  });
  const parsed = await parseChatCompletionResponse(response);
  return {
    content: parsed.content,
    model: parsed.model || config.modelName,
    usage: parsed.usage,
  };
}
