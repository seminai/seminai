import { useCallback, useEffect, useRef, useState } from 'react';
import { History, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatInput, type ChatAttachmentItem } from '@/components/molecules/chat-input';
import { ChatActionBar } from '@/components/molecules/chat-action-bar';
import { ChatMessageList } from '@/components/molecules/chat-message-list';
import { ChatHistoryPanel } from '@/components/organisms/chat-history-panel';
import { useTabs } from '@/hooks/use-tabs';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useDosageChatDetailQuery, useDosageChatsQuery } from '@/hooks/use-dosage-chat';
import { useDosageChatStream } from '@/hooks/use-dosage-chat-stream';
import { useWorkspace } from '@/hooks/use-workspace';
import { getOrCreatePendingThreadId } from '@/lib/chat-stream-store';
import { useTranscribeAudio } from '@/hooks/use-transcribe-audio';
import { useMentionSearch } from '@/hooks/use-mention-search';
import { mapChatMessages, mapChatsToHistoryItems } from '@/types/dosage-chat';
import { buildChatTabTitle, buildChatTabTitleFromMessages } from '@/lib/chat-tab-format';
import { CHAT_QUICK_ACTIONS, type ChatQuickActionId } from '@/constants/chat-quick-actions';
import { resolveApiWorkspaceId } from '@/lib/workspace-id';
import type { MentionItem, MentionSearchResultItem } from '@/types/mention';

interface ChatLayoutProps {
  readonly chatId?: string | null;
}

export function ChatLayout({ chatId = null }: ChatLayoutProps) {
  const { addTab, tabs } = useTabs();
  const { activeWorkspaceId } = useWorkspace();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<readonly { id: string; file: File }[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);
  const isNewChat = !chatId || chatId === 'new';
  const [localThreadId] = useState(() =>
    isNewChat ? getOrCreatePendingThreadId() : crypto.randomUUID(),
  );
  const openAttachmentPickerRef = useRef<(() => void) | null>(null);
  const pendingTabTitleRef = useRef<string | null>(null);

  const [mentions, setMentions] = useState<readonly MentionItem[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [isMentionActive, setIsMentionActive] = useState(false);
  const mentionSearch = useMentionSearch(isMentionActive ? mentionQuery : '');

  const effectiveChatId = isNewChat ? null : chatId;

  const chatsQuery = useDosageChatsQuery();
  const chatDetailQuery = useDosageChatDetailQuery(effectiveChatId);
  const chatHistoryItems = mapChatsToHistoryItems(chatsQuery.data?.data ?? []);
  const messages = mapChatMessages(chatDetailQuery.data?.data.messages ?? []);
  const threadId = isNewChat ? localThreadId : (chatDetailQuery.data?.data.threadId ?? null);
  const currentChatTab = tabs.find((tab) => tab.id === effectiveChatId);

  const handleChatCreated = useCallback((newChatId: string) => {
    addTab({ id: newChatId, title: pendingTabTitleRef.current ?? 'Chat', format: '-', source: 'chat' });
  }, [addTab]);

  const stream = useDosageChatStream({
    threadId,
    chatId: effectiveChatId,
    localThreadId,
    onChatCreated: handleChatCreated,
  });

  useEffect(() => {
    if (stream.streamError) setInputError(stream.streamError);
  }, [stream.streamError]);

  useEffect(() => {
    const detail = chatDetailQuery.data?.data;
    if (!effectiveChatId || !detail) return;
    const title = buildChatTabTitleFromMessages(detail.messages, detail.updatedAt);
    if (currentChatTab?.title === title) return;
    addTab({ id: effectiveChatId, title, format: '-', source: 'chat' });
  }, [addTab, chatDetailQuery.data?.data, currentChatTab?.title, effectiveChatId]);

  const showChatDetail = Boolean(effectiveChatId);
  const isDetailLoading = showChatDetail && chatDetailQuery.isPending;
  const isDetailError = showChatDetail && chatDetailQuery.isError;
  const attachmentItems: readonly ChatAttachmentItem[] = attachments.map(({ id, file }) => ({
    id,
    name: file.name,
    size: file.size,
  }));

  const transcribeAudioMutation = useTranscribeAudio({
    onText: (text) => {
      setInputError(null);
      setMessage((current) => (current.trim() ? `${current.trim()}\n${text}` : text));
    },
    onEmpty: () => setInputError('Trascrizione vuota: prova con un altro audio.'),
    onError: () => setInputError('Trascrizione audio non riuscita.'),
  });

  const handleRecordingComplete = useCallback(
    (file: File) => void transcribeAudioMutation.mutateAsync(file),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { isRecording, startRecording, stopRecording } = useAudioRecorder(handleRecordingComplete);

  function handleToggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      void startRecording().catch(() => {
        setInputError('Impossibile accedere al microfono. Controlla i permessi del browser.');
      });
    }
  }

  function handleAddAttachments(files: readonly File[]) {
    if (files.length === 0) return;
    const next = files.map((file) => ({
      id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
      file,
    }));
    setInputError(null);
    setAttachments((current) => [...current, ...next]);
  }

  function handleRemoveAttachment(attachmentId: string) {
    setAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  function handleMentionSelect(item: MentionSearchResultItem) {
    if (mentions.some((m) => m.id === item.id && m.type === item.type)) return;
    setMentions((current) => [...current, { type: item.type, id: item.id, label: item.label }]);
  }

  function handleRemoveMention(mentionId: string) {
    setMentions((current) => current.filter((m) => m.id !== mentionId));
  }

  function handleMentionQueryChange(query: string, isActive: boolean) {
    setMentionQuery(query);
    setIsMentionActive(isActive);
  }

  function dispatchSend(text: string) {
    const filesPayload = attachments.map((a) => a.file);
    const mentionPayload = mentions.length > 0 ? [...mentions] : undefined;
    pendingTabTitleRef.current = buildChatTabTitle({ message: text });
    stream.sendMessage({
      message: text,
      files: filesPayload,
      mentions: mentionPayload,
      workspaceId: resolveApiWorkspaceId(activeWorkspaceId),
    });
    setMessage('');
    setAttachments([]);
    setMentions([]);
    setInputError(null);
    stream.clearStreamError();
  }

  function handleSendMessage() {
    if (transcribeAudioMutation.isPending || isRecording) return;
    dispatchSend(message);
  }

  function handleQuickAction(actionId: ChatQuickActionId) {
    if (transcribeAudioMutation.isPending || isRecording) return;
    const selectedAction = CHAT_QUICK_ACTIONS.find((action) => action.id === actionId);
    if (!selectedAction) return;
    if (selectedAction.openFilePicker) {
      openAttachmentPickerRef.current?.();
    }
    dispatchSend(selectedAction.prompt);
  }

  const chatInputProps = {
    mentionDropdownSide: 'top' as const,
    message,
    attachments: attachmentItems,
    mentions,
    mentionResults: mentionSearch.results,
    isMentionActive,
    isMentionSearching: mentionSearch.isLoading,
    isSending: stream.isStreaming,
    isTranscribingAudio: transcribeAudioMutation.isPending,
    errorMessage: inputError,
    onMessageChange: (value: string) => {
      setMessage(value);
      if (inputError) setInputError(null);
      stream.clearStreamError();
    },
    onSend: handleSendMessage,
    onCancel: stream.cancel,
    onSelectAttachments: handleAddAttachments,
    onRegisterAttachmentPicker: (open: () => void) => {
      openAttachmentPickerRef.current = open;
    },
    isRecording,
    onToggleRecording: handleToggleRecording,
    onRemoveAttachment: handleRemoveAttachment,
    onMentionSelect: handleMentionSelect,
    onRemoveMention: handleRemoveMention,
    onMentionQueryChange: handleMentionQueryChange,
  } as const;

  return (
    <div className="flex flex-1 overflow-hidden">
      {historyOpen && (
        <ChatHistoryPanel
          activeChatId={chatId}
          chats={chatHistoryItems}
          isLoading={chatsQuery.isPending}
          isError={chatsQuery.isError}
          onRetry={() => void chatsQuery.refetch()}
          onChatSelect={(chat) =>
            addTab({ id: chat.id, title: chat.title, format: '-', source: 'chat' })
          }
          onClose={() => setHistoryOpen(false)}
        />
      )}

      <div className="flex flex-1 flex-col">
        <div className="flex items-center justify-between px-4 py-3">
          {historyOpen ? (
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5" />
              <h2 className="font-semibold">Chat</h2>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setHistoryOpen(true)}
              title="Chat passate"
            >
              <History className="h-4 w-4" />
            </Button>
          )}
        </div>

        {showChatDetail && isDetailLoading && (
          <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
            Caricamento messaggi...
          </div>
        )}

        {showChatDetail && isDetailError && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6">
            <p className="text-sm text-destructive">Errore nel caricamento della chat.</p>
            <Button variant="outline" size="sm" onClick={() => void chatDetailQuery.refetch()}>
              Riprova
            </Button>
          </div>
        )}

        {showChatDetail && !isDetailLoading && !isDetailError ? (
          <>
            {messages.length > 0 || stream.transientUser || stream.transientAssistant ? (
              <ChatMessageList
                messages={messages}
                transientUser={stream.transientUser}
                transientAssistant={stream.transientAssistant}
                onApprove={stream.approve}
                onReject={() => stream.reject()}
                onRetry={stream.retry}
              />
            ) : (
              <div className="flex flex-1 items-center justify-center px-6 text-sm text-muted-foreground">
                Nessun messaggio salvato per questa chat.
              </div>
            )}
            <div className="border-t px-6 py-4">
              <ChatInput {...chatInputProps} />
            </div>
          </>
        ) : null}

        {!showChatDetail && (
          <>
            {(stream.transientUser || stream.transientAssistant) && (
              <ChatMessageList
                messages={messages}
                transientUser={stream.transientUser}
                transientAssistant={stream.transientAssistant}
                onApprove={stream.approve}
                onReject={() => stream.reject()}
                onRetry={stream.retry}
              />
            )}
            <div
              className={
                stream.transientUser || stream.transientAssistant
                  ? 'border-t px-6 py-4'
                  : 'flex flex-1 flex-col items-center justify-center gap-6 px-6'
              }
            >
              <ChatInput {...chatInputProps} />
              {!stream.transientUser && !stream.transientAssistant && (
                <ChatActionBar
                  onSelectAction={handleQuickAction}
                  isBusy={stream.isStreaming || transcribeAudioMutation.isPending || isRecording}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
