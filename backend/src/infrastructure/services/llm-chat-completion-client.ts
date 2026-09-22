import { buildOpenRouterHeaders } from './llm-gateway-headers';
import { fetchAnthropicCompletion } from './llm-anthropic-messages-client';
import { resolveChatModelConfig } from './llm-config';

export type ChatCompletionRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatCompletionTextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface ChatCompletionImageUrlPart {
  readonly type: 'image_url';
  readonly image_url: {
    readonly url: string;
    readonly detail?: 'auto' | 'low' | 'high';
  };
}

export type ChatCompletionContentPart = ChatCompletionTextPart | ChatCompletionImageUrlPart;

export interface ChatCompletionMessage {
  readonly role: ChatCompletionRole;
  readonly content: string | readonly ChatCompletionContentPart[];
}

export interface ChatCompletionRequest {
  readonly model?: string;
  readonly messages: readonly ChatCompletionMessage[];
  readonly temperature?: number;
  readonly maxTokens?: number;
  readonly tools?: readonly unknown[];
  readonly toolChoice?: 'auto' | 'none';
  readonly responseFormat?: { readonly type: 'json_object' | 'text' };
  readonly signal?: AbortSignal;
}

export interface ChatCompletionResponseBody {
  readonly choices?: ReadonlyArray<{
    readonly message?: { readonly content?: string | null };
  }>;
  readonly usage?: Record<string, unknown>;
}

export async function fetchChatCompletion(request: ChatCompletionRequest): Promise<Response> {
  const config = resolveChatModelConfig(request.model);
  if (config.provider === 'claude') {
    return fetchAnthropicCompletion(request, config.modelName, config.apiKey);
  }
  const body: Record<string, unknown> = {
    model: config.modelName,
    messages: request.messages,
    temperature: request.temperature,
    max_tokens: request.maxTokens,
    tools: request.tools,
    tool_choice: request.toolChoice,
  };
  if (request.responseFormat) {
    body.response_format = request.responseFormat;
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${config.apiKey}`,
  };
  if (config.gateway === 'openrouter') {
    Object.assign(headers, buildOpenRouterHeaders(config.referer, config.title));
  }
  return fetch(`${config.baseUrl ?? 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: request.signal,
  });
}

export async function parseChatCompletionResponse(response: Response): Promise<{
  readonly content: string;
  readonly usage?: Record<string, unknown>;
  readonly model: string;
}> {
  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Chat completion failed (${response.status}): ${errorBody}`);
  }
  const data = (await response.json()) as ChatCompletionResponseBody & { readonly model?: string };
  const rawContent = data.choices?.[0]?.message?.content;
  const content = typeof rawContent === 'string' ? rawContent.trim() : '';
  return {
    content,
    usage: data.usage,
    model: data.model ?? '',
  };
}
