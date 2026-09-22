import type { ChatCompletionMessage, ChatCompletionRequest } from './llm-chat-completion-client';

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

interface AnthropicMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

interface AnthropicRequestBody {
  readonly model: string;
  readonly max_tokens: number;
  readonly temperature?: number;
  readonly system?: string;
  readonly messages: readonly AnthropicMessage[];
}

interface AnthropicResponseBody {
  readonly model?: string;
  readonly content?: ReadonlyArray<{ readonly type?: string; readonly text?: string }>;
  readonly usage?: Record<string, unknown>;
}

function extractSystemPrompt(messages: readonly ChatCompletionMessage[]): string | undefined {
  const systemMessages = messages
    .filter((message) => message.role === 'system')
    .map((message) => (typeof message.content === 'string' ? message.content : ''))
    .filter((content) => content.length > 0);
  if (systemMessages.length === 0) {
    return undefined;
  }
  return systemMessages.join('\n\n');
}

function toAnthropicMessages(messages: readonly ChatCompletionMessage[]): AnthropicMessage[] {
  return messages
    .filter((message) => message.role === 'user' || message.role === 'assistant')
    .map((message) => ({
      role: message.role as 'user' | 'assistant',
      content:
        typeof message.content === 'string' ? message.content : JSON.stringify(message.content),
    }));
}

function buildAnthropicRequestBody(
  request: ChatCompletionRequest,
  modelName: string,
): AnthropicRequestBody {
  const systemPrompt = extractSystemPrompt(request.messages);
  const jsonInstruction =
    request.responseFormat?.type === 'json_object'
      ? 'Respond with valid JSON only, without markdown fences or extra text.'
      : undefined;
  const body: AnthropicRequestBody = {
    model: modelName,
    max_tokens: request.maxTokens ?? 4096,
    temperature: request.temperature,
    messages: toAnthropicMessages(request.messages),
  };
  if (systemPrompt || jsonInstruction) {
    return {
      ...body,
      system: [systemPrompt, jsonInstruction].filter(Boolean).join('\n\n'),
    };
  }
  return body;
}

function toOpenAiCompatibleResponse(data: AnthropicResponseBody): Response {
  const textContent =
    data.content
      ?.filter((block) => block.type === 'text' && typeof block.text === 'string')
      .map((block) => block.text ?? '')
      .join('') ?? '';
  const payload = {
    model: data.model ?? '',
    usage: data.usage,
    choices: [{ message: { content: textContent } }],
  };
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function fetchAnthropicCompletion(
  request: ChatCompletionRequest,
  modelName: string,
  apiKey: string,
): Promise<Response> {
  const response = await fetch(ANTHROPIC_MESSAGES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify(buildAnthropicRequestBody(request, modelName)),
    signal: request.signal,
  });
  if (!response.ok) {
    return response;
  }
  const data = (await response.json()) as AnthropicResponseBody;
  return toOpenAiCompatibleResponse(data);
}
