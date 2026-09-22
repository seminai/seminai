import {
  getAgentChatThreadsThreadIdStreamEvents,
  getAgentChatThreadsThreadIdStreamState,
} from '@/generated/api/agent-chat/agent-chat';
import {
  createInitialAssistant,
} from '@/hooks/use-dosage-chat-stream-reducer';
import type { AgentStreamEvent } from '@/lib/agent-chat-events';
import type {
  ResumeStreamEventsData,
  ResumeStreamStateData,
} from './chat-stream-store.part-02-cleanup-after-complete';
import { CHAT_ID_RESOLVE_DELAYS_MS, RESUME_DEFAULT_LIMIT, TERMINAL_EVENT_TYPES, cleanupAfterComplete, delay, unwrapGeneratedApiData } from './chat-stream-store.part-02-cleanup-after-complete';
import { applyEventWithSeq, handleChatCreatedEvent, runtime, setState, setStreamChatId } from './chat-stream-store.part-01-send-message-input';

export async function resolveCreatedChatIdFromState(threadId: string): Promise<void> {
  for (const delayMs of CHAT_ID_RESOLVE_DELAYS_MS) {
    if (runtime.states.get(threadId)?.chatId) return;
    await delay(delayMs);
    if (runtime.states.get(threadId)?.chatId) return;

    try {
      const stateResponse = await getAgentChatThreadsThreadIdStreamState(threadId);
      const state = unwrapGeneratedApiData<ResumeStreamStateData>(stateResponse);
      if (state?.chatId) {
        handleChatCreatedEvent(threadId, state.chatId);
        return;
      }
    } catch {
      // Best-effort fallback: SSE/socket and final cleanup still cover this path.
    }
  }
}

export function isTerminalStatus(lastStatus: string | null): boolean {
  if (!lastStatus) return false;
  return TERMINAL_EVENT_TYPES.has(lastStatus === 'completed' ? 'complete' : lastStatus);
}

export async function resumeStream(threadId: string): Promise<void> {
  try {
    const stateResponse = await getAgentChatThreadsThreadIdStreamState(threadId);
    const state = unwrapGeneratedApiData<ResumeStreamStateData>(stateResponse);
    if (!state) return;
    if (state.chatId) {
      setStreamChatId(threadId, state.chatId);
    }
    const isStreamingServer = state.isStreaming === true;
    const serverLastSeq = typeof state.lastSeq === 'number' ? state.lastSeq : 0;
    const local = runtime.states.get(threadId);
    const localLastSeq = local?.lastEventSeq ?? 0;
    const lastStatus = typeof state.lastStatus === 'string' ? state.lastStatus : null;
    const isTerminalServerState = isTerminalStatus(lastStatus);
    const shouldFetch = isStreamingServer || serverLastSeq > localLastSeq;
    if (!shouldFetch) {
      if (isTerminalServerState) {
        setState(threadId, (current) => ({ ...current, isStreaming: false }));
        await cleanupAfterComplete(threadId);
      }
      return;
    }
    setState(threadId, (current) => ({
      ...current,
      isStreaming: isStreamingServer,
      transientAssistant: current.transientAssistant ?? createInitialAssistant(),
    }));
    const eventsResponse = await getAgentChatThreadsThreadIdStreamEvents(threadId, {
      since: localLastSeq,
      limit: RESUME_DEFAULT_LIMIT,
    });
    const eventsData = unwrapGeneratedApiData<ResumeStreamEventsData>(eventsResponse);
    const events = eventsData?.events ?? [];
    for (const row of events) {
      if (typeof row.seq !== 'number' || !row.payload || typeof row.type !== 'string') continue;
      applyEventWithSeq(threadId, row.payload as unknown as AgentStreamEvent, row.seq);
    }
    if (isTerminalServerState) {
      setState(threadId, (current) => ({ ...current, isStreaming: false }));
      await cleanupAfterComplete(threadId);
    }
  } catch {
    // Resume is best-effort: if state/events fetch fails the user can retry
    // by sending a new message. Avoid surfacing this as a stream error.
  }
}
