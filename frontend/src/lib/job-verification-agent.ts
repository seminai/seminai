import { customFetch } from '@/lib/api-client';

const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export interface JobVerificationStreamPayload {
  readonly threadId: string;
  readonly jobs: readonly Record<string, unknown>[];
  readonly message: string;
}

export interface AgentEvent {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface AgentResponseEnvelope<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
}

export interface JobVerificationApproveBody {
  readonly threadId: string;
  readonly modification?: {
    readonly jobId: string;
    readonly field: string;
    readonly newValue: unknown;
  };
  readonly modifications?: ReadonlyArray<{
    readonly jobId: string;
    readonly field: string;
    readonly newValue: unknown;
  }>;
}

export interface JobVerificationRejectBody {
  readonly threadId: string;
  readonly reason: string;
}

function parseSseLines(rawChunk: string): readonly string[] {
  return rawChunk
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('data: '))
    .map((line) => line.slice(6));
}

function safeParse(payload: string): AgentEvent | null {
  try {
    return JSON.parse(payload) as AgentEvent;
  } catch (error) {
    const preview = payload.length > 180 ? `${payload.slice(0, 180)}...` : payload;
    const errorText = error instanceof Error ? error.message : String(error);
    console.warn('[job-verification-agent] Failed to parse SSE payload', {
      error: errorText,
      payloadLength: payload.length,
      payloadPreview: preview,
    });
    return null;
  }
}

export async function streamJobVerificationAgent(
  payload: JobVerificationStreamPayload,
  onEvent: (event: AgentEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const requestUrl = new URL(`${BASE_URL}/job-verification-agent/stream`, window.location.origin);
  const response = await fetch(requestUrl.toString(), {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal,
  });
  if (!response.ok) {
    throw new Error(`Stream request failed with status ${response.status}`);
  }
  if (!response.body) {
    throw new Error('Stream response body is empty.');
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pendingBuffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pendingBuffer += decoder.decode(value, { stream: true });
    const chunks = pendingBuffer.split('\n\n');
    pendingBuffer = chunks.pop() ?? '';
    for (const chunk of chunks) {
      const payloads = parseSseLines(chunk);
      for (const eventPayload of payloads) {
        const event = safeParse(eventPayload);
        if (event) onEvent(event);
      }
    }
  }
}

export function postJobVerificationMessage(payload: JobVerificationStreamPayload) {
  return customFetch<AgentResponseEnvelope<Record<string, unknown>>>('/job-verification-agent/message', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function postJobVerificationApprove(payload: JobVerificationApproveBody) {
  return customFetch<AgentResponseEnvelope<Record<string, unknown>>>('/job-verification-agent/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function postJobVerificationReject(payload: JobVerificationRejectBody) {
  return customFetch<AgentResponseEnvelope<Record<string, unknown>>>('/job-verification-agent/reject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export function getJobVerificationState(threadId: string) {
  return customFetch<AgentResponseEnvelope<Record<string, unknown>>>(
    `/job-verification-agent/state/${threadId}`,
    {
      method: 'GET',
    },
  );
}
