import type { MentionItem } from '@/types/mention';
import {
  parseSseDataLines,
  safeParseEvent,
  type AgentStreamEvent,
} from './agent-chat-events';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface AgentChatStreamPayload {
  readonly threadId: string;
  readonly message: string;
  readonly files?: readonly File[];
  readonly mentions?: readonly MentionItem[];
  readonly clientContext?: Record<string, unknown>;
  /** Active workspace ID; routes the chat to the agent matching the workspace kind. */
  readonly workspaceId?: string;
  /** Job ID for job-scoped chat; forces the agricultural (dosage) agent on the BE. */
  readonly jobId?: string;
}

export type AgentStreamEventHandler = (event: AgentStreamEvent) => void;

interface ApiErrorBody {
  readonly message?: string;
  readonly code?: string;
}

async function buildStreamRequestError(response: Response): Promise<Error> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (body.code === 'WORKSPACE_ACCESS_DENIED') {
      return new Error('Accesso al workspace negato. Seleziona un workspace valido o riprova.');
    }
    if (typeof body.message === 'string' && body.message.trim().length > 0) {
      return new Error(body.message);
    }
  } catch {
    // Fall back to status-only message when the body is not JSON.
  }
  return new Error(`Stream request failed with status ${response.status}`);
}

function buildFormData(payload: AgentChatStreamPayload): FormData {
  const formData = new FormData();
  formData.append('threadId', payload.threadId);
  formData.append('message', payload.message);
  (payload.files ?? []).forEach((file) => formData.append('files', file));
  if (payload.mentions && payload.mentions.length > 0) {
    formData.append('mentions', JSON.stringify(payload.mentions));
  }
  if (payload.clientContext && Object.keys(payload.clientContext).length > 0) {
    formData.append('clientContext', JSON.stringify(payload.clientContext));
  }
  if (payload.workspaceId) {
    formData.append('workspaceId', payload.workspaceId);
  }
  if (payload.jobId) {
    formData.append('jobId', payload.jobId);
  }
  return formData;
}

async function consumeSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: AgentStreamEventHandler,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pendingBuffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pendingBuffer += decoder.decode(value, { stream: true });

    const chunks = pendingBuffer.split('\n\n');
    pendingBuffer = chunks.pop() ?? '';

    for (const chunk of chunks) {
      const payloads = parseSseDataLines(chunk);
      for (const rawPayload of payloads) {
        const event = safeParseEvent(rawPayload);
        if (!event) continue;
        onEvent(event);
      }
    }
  }
}

export async function streamAgentChat(
  payload: AgentChatStreamPayload,
  onEvent: AgentStreamEventHandler,
  signal?: AbortSignal,
): Promise<void> {
  const requestUrl = new URL(`${BASE_URL}/agent-chat/stream`, window.location.origin);
  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    body: buildFormData(payload),
    credentials: 'include',
    headers: { Accept: 'text/event-stream' },
    signal,
  });

  if (!response.ok) {
    throw await buildStreamRequestError(response);
  }
  if (!response.body) {
    throw new Error('Stream response body is empty.');
  }

  await consumeSseStream(response.body, onEvent);
}

interface LegacyStreamPayload {
  readonly threadId: string;
  readonly message: string;
  readonly files: readonly File[];
  readonly mentions?: readonly MentionItem[];
  readonly workspaceId?: string;
  readonly jobId?: string;
  readonly signal?: AbortSignal;
}

export async function postAgentChatStreamWithFiles(
  payload: LegacyStreamPayload,
): Promise<string | null> {
  let completeMessage: string | null = null;
  await streamAgentChat(
    {
      threadId: payload.threadId,
      message: payload.message,
      files: payload.files,
      mentions: payload.mentions,
      workspaceId: payload.workspaceId,
      jobId: payload.jobId,
    },
    (event) => {
      if (event.type === 'error') {
        const errMsg = typeof event.error === 'string' ? event.error : 'Agent stream failed.';
        throw new Error(errMsg);
      }
      if (event.type === 'complete') {
        completeMessage = event.response?.message ?? completeMessage;
      }
    },
    payload.signal,
  );
  return completeMessage;
}
