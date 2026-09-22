import { useCallback, useRef, useState } from 'react';
import { ArrowUp, Loader2, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatMessageList } from '@/components/molecules/chat-message-list';
import { useDosageChatStream } from '@/hooks/use-dosage-chat-stream';
import { useWorkspace } from '@/hooks/use-workspace';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import { resolveApiWorkspaceId } from '@/lib/workspace-id';

interface AgentChatPanelProps {
  readonly localThreadId: string;
  readonly threadId?: string | null;
  readonly chatId?: string | null;
  readonly clientContext?: Record<string, unknown>;
  readonly placeholder?: string;
  readonly emptyHint?: string;
  readonly onChatCreated?: (newChatId: string) => void;
}

const DEFAULT_PLACEHOLDER = "Scrivi un messaggio all'assistente...";
const DEFAULT_EMPTY_HINT = "Chiedi all'assistente di aiutarti.";

export function AgentChatPanel({
  localThreadId,
  threadId = null,
  chatId = null,
  clientContext,
  placeholder = DEFAULT_PLACEHOLDER,
  emptyHint = DEFAULT_EMPTY_HINT,
  onChatCreated,
}: AgentChatPanelProps) {
  const { activeWorkspaceId } = useWorkspace();
  const [message, setMessage] = useState('');
  const [inputError, setInputError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const stream = useDosageChatStream({
    threadId,
    chatId,
    localThreadId,
    onChatCreated,
  });

  const displayError =
    inputError ?? (stream.streamError ? sanitizeUserFacingText(stream.streamError) : null);

  const handleSend = useCallback(() => {
    const trimmed = message.trim();
    if (!trimmed) {
      setInputError('Inserisci un messaggio prima di inviare.');
      return;
    }
    setInputError(null);
    stream.clearStreamError();
    stream.sendMessage({
      message: trimmed,
      clientContext,
      workspaceId: resolveApiWorkspaceId(activeWorkspaceId),
    });
    setMessage('');
  }, [message, clientContext, stream, activeWorkspaceId]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const hasMessages = Boolean(stream.transientUser || stream.transientAssistant);
  const canSend = Boolean(message.trim()) && !stream.isStreaming;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-md border bg-card">
      {hasMessages ? (
        <ChatMessageList
          messages={[]}
          transientUser={stream.transientUser}
          transientAssistant={stream.transientAssistant}
          onApprove={stream.approve}
          onReject={() => stream.reject()}
          onRetry={stream.retry}
        />
      ) : (
        <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
          {emptyHint}
        </div>
      )}
      <div className="border-t px-4 py-3">
        <div className="relative rounded-xl border shadow-sm">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(event) => {
              setMessage(event.target.value);
              if (inputError) setInputError(null);
              stream.clearStreamError();
            }}
            placeholder={placeholder}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none placeholder:text-muted-foreground"
            rows={3}
            onKeyDown={handleKeyDown}
            disabled={stream.isStreaming}
          />
          {displayError && <p className="px-4 pb-2 text-xs text-destructive">{displayError}</p>}
          <div className="flex items-center justify-end px-3 pb-3">
            {stream.isStreaming ? (
              <Button
                size="icon-sm"
                variant="secondary"
                className="rounded-full"
                onClick={stream.cancel}
                title="Annulla"
              >
                <Square className="h-3.5 w-3.5 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                className="rounded-full"
                disabled={!canSend}
                onClick={handleSend}
              >
                {stream.isStreaming ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ArrowUp className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
