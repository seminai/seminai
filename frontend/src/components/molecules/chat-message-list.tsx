import { useEffect, useMemo, useRef } from 'react';
import { ChatMessageBubble } from '@/components/atoms/chat-message-bubble';
import { AgentThinkingBubble } from '@/components/molecules/agent-thinking-bubble';
import { HistoricalExtractionReviewBubble } from '@/components/molecules/historical-extraction-review-bubble';
import { HistoricalExtractionArchivedBubble } from '@/components/molecules/historical-extraction-archived-bubble';
import { HistoricalExtractionFailedBubble } from '@/components/molecules/historical-extraction-failed-bubble';
import { ExtractionProgressStrip } from '@/components/molecules/extraction-progress-strip';
import { useChatExtractionProgress } from '@/hooks/use-chat-extraction-progress';
import type { ChatMessageViewModel } from '@/types/dosage-chat';
import type {
  TransientAssistantMessage,
  TransientUserMessage,
} from '@/types/chat-stream';
import { createApprovalAssistantFromPersisted } from '@/hooks/use-dosage-chat-stream-reducer';

function isPendingApprovalMessage(msg: ChatMessageViewModel): boolean {
  return (
    msg.role === 'assistant' &&
    msg.status === 'REQUIRES_APPROVAL' &&
    msg.pendingToolCalls.length > 0
  );
}

interface ChatMessageListProps {
  readonly messages: readonly ChatMessageViewModel[];
  readonly transientUser?: TransientUserMessage | null;
  readonly transientAssistant?: TransientAssistantMessage | null;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
  readonly onRetry?: () => void;
}

function formatTransientUserTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '--:--';
  }
}

function normalizeMessageContent(content: string): string {
  return content.trim().replace(/\s+/g, ' ');
}

function isSameRecentUserMessage(
  message: ChatMessageViewModel,
  transientUser: TransientUserMessage,
): boolean {
  if (message.role !== 'user') return false;
  if (normalizeMessageContent(message.content) !== normalizeMessageContent(transientUser.content)) {
    return false;
  }

  const persistedAt = new Date(message.createdAtIso).getTime();
  const transientAt = new Date(transientUser.createdAtIso).getTime();
  if (Number.isNaN(persistedAt) || Number.isNaN(transientAt)) return true;

  return persistedAt >= transientAt - 30_000 && persistedAt <= transientAt + 5 * 60_000;
}

export function ChatMessageList({
  messages,
  transientUser,
  transientAssistant,
  onApprove,
  onReject,
  onRetry,
}: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [
    messages.length,
    transientUser?.id,
    transientAssistant?.status,
    transientAssistant?.content.length,
    transientAssistant?.toolCalls.length,
  ]);

  const persistedTransientUserIndex = useMemo(() => {
    if (!transientUser) return -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg) continue;
      if (isSameRecentUserMessage(msg, transientUser)) return i;
    }
    return -1;
  }, [messages, transientUser]);

  const hasPersistedAssistantForTransientUser =
    persistedTransientUserIndex >= 0 &&
    messages.slice(persistedTransientUserIndex + 1).some((msg) => msg.role === 'assistant');

  const visibleTransientUser = persistedTransientUserIndex >= 0 ? null : transientUser;
  const visibleTransientAssistant = hasPersistedAssistantForTransientUser
    ? null
    : transientAssistant;

  const actionablePendingIndex = useMemo(() => {
    if (visibleTransientAssistant) return -1;
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (!msg) continue;
      if (isPendingApprovalMessage(msg)) return i;
      if (msg.role === 'assistant') return -1;
    }
    return -1;
  }, [messages, visibleTransientAssistant]);

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3 overflow-y-auto px-6 py-4">
      {messages.map((msg, index) => {
        if (index === actionablePendingIndex) {
          return (
            <AgentThinkingBubble
              key={msg.id}
              assistant={createApprovalAssistantFromPersisted({
                id: msg.id,
                content: msg.content,
                createdAtIso: msg.createdAtIso,
                pendingToolCalls: msg.pendingToolCalls,
              })}
              onApprove={onApprove}
              onReject={onReject}
            />
          );
        }
        if (msg.role === 'assistant' && msg.extractionFailed) {
          return <HistoricalExtractionFailedBubble key={msg.id} message={msg} />;
        }
        if (msg.role === 'assistant' && msg.extractionReviewId && !transientAssistant) {
          return <HistoricalExtractionReviewBubble key={msg.id} message={msg} />;
        }
        if (msg.role === 'assistant' && msg.archivedExtractionId) {
          return <HistoricalExtractionArchivedBubble key={msg.id} message={msg} />;
        }
        return (
          <ChatMessageBubble
            key={msg.id}
            role={msg.role}
            content={msg.content}
            timestamp={msg.timestamp}
            attachments={msg.attachments}
          />
        );
      })}
      {visibleTransientUser && (
        <ChatMessageBubble
          key={visibleTransientUser.id}
          role="user"
          content={visibleTransientUser.content}
          timestamp={formatTransientUserTime(visibleTransientUser.createdAtIso)}
          status={visibleTransientUser.status}
          attachments={visibleTransientUser.attachments}
          onRetry={visibleTransientUser.status === 'error' ? onRetry : undefined}
        />
      )}
      {visibleTransientAssistant && (
        <AgentThinkingBubble
          assistant={visibleTransientAssistant}
          onApprove={onApprove}
          onReject={onReject}
          onRetry={onRetry}
        />
      )}
      <ExtractionProgressIndicator />
      <div ref={bottomRef} />
    </div>
  );
}

function ExtractionProgressIndicator() {
  const entry = useChatExtractionProgress();
  if (!entry) return null;
  return <ExtractionProgressStrip entry={entry} />;
}
