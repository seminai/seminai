import { useState, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ChatInput, type ChatAttachmentItem } from '@/components/molecules/chat-input';
import { useTabs } from '@/hooks/use-tabs';
import { useAudioRecorder } from '@/hooks/use-audio-recorder';
import { useMentionSearch } from '@/hooks/use-mention-search';
import { useDosageChatsQuery } from '@/hooks/use-dosage-chat';
import { useWorkspace } from '@/hooks/use-workspace';
import { postAgentChatMessage } from '@/generated/api/agent-chat/agent-chat';
import { postAgentChatStreamWithFiles } from '@/lib/agent-chat-stream';
import { buildChatTabTitle } from '@/lib/chat-tab-format';
import { postAudioToTextTranscribe } from '@/generated/api/audio-to-text/audio-to-text';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import { consumePendingThreadId, getOrCreatePendingThreadId } from '@/lib/chat-stream-store';
import { resolveApiWorkspaceId } from '@/lib/workspace-id';
import type { MentionItem, MentionSearchResultItem } from '@/types/mention';

export function HomeChatSection() {
  const { t } = useTranslation();
  const { addTab } = useTabs();
  const { activeWorkspaceId } = useWorkspace();
  const queryClient = useQueryClient();
  const chatsQuery = useDosageChatsQuery();

  const [message, setMessage] = useState('');
  const [attachments, setAttachments] = useState<readonly { id: string; file: File }[]>([]);
  const [inputError, setInputError] = useState<string | null>(null);
  const [threadId] = useState(() => getOrCreatePendingThreadId());

  const [mentions, setMentions] = useState<readonly MentionItem[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [isMentionActive, setIsMentionActive] = useState(false);
  const mentionSearch = useMentionSearch(isMentionActive ? mentionQuery : '');

  const sendMutation = useMutation({
    mutationFn: async () => {
      const trimmed = message.trim();
      if (!trimmed) throw new Error(t('home.chat.errors.emptyMessage'));

      const mentionPayload = mentions.length > 0 ? [...mentions] : undefined;

      if (attachments.length > 0) {
        await postAgentChatStreamWithFiles({
          threadId,
          message: trimmed,
          files: attachments.map((a) => a.file),
          mentions: mentionPayload,
          workspaceId: resolveApiWorkspaceId(activeWorkspaceId),
        });
        return trimmed;
      }

      await postAgentChatMessage({
        threadId,
        message: trimmed,
        mentions: mentionPayload,
        workspaceId: resolveApiWorkspaceId(activeWorkspaceId),
      });
      return trimmed;
    },
    onSuccess: async (sentMessage) => {
      setMessage('');
      setAttachments([]);
      setMentions([]);
      setInputError(null);

      await queryClient.invalidateQueries({ queryKey: ['chats'] });
      const refreshed = await chatsQuery.refetch();
      const newChat = refreshed.data?.data?.find((c) => c.threadId === threadId);
      if (newChat) {
        consumePendingThreadId(threadId);
        addTab({
          id: newChat.id,
          title: buildChatTabTitle({ message: sentMessage, updatedAt: newChat.updatedAt }),
          format: '-',
          source: 'chat',
        });
      }
    },
    onError: (error) => {
      setInputError(
        error instanceof Error ? sanitizeUserFacingText(error.message) : t('home.chat.errors.sendFailed'),
      );
    },
  });

  const transcribeMutation = useMutation({
    mutationFn: async (file: File) => {
      const response = await postAudioToTextTranscribe({
        file,
        postProcess: 'true',
        responseFormat: 'verbose_json',
      });
      if (response.status !== 200 || !response.data || typeof response.data !== 'object')
        return '';
      const data = response.data as { data?: { text?: string } };
      return data.data?.text?.trim() ?? '';
    },
    onSuccess: (text) => {
      if (!text) {
        setInputError(t('home.chat.errors.transcriptionEmpty'));
        return;
      }
      setInputError(null);
      setMessage((prev) => (prev.trim() ? `${prev.trim()}\n${text}` : text));
    },
    onError: () => setInputError(t('home.chat.errors.transcriptionFailed')),
  });

  const handleRecordingComplete = useCallback(
    (file: File) => void transcribeMutation.mutateAsync(file),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { isRecording, startRecording, stopRecording } = useAudioRecorder(handleRecordingComplete);

  const attachmentItems: readonly ChatAttachmentItem[] = attachments.map(({ id, file }) => ({
    id,
    name: file.name,
    size: file.size,
  }));

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted-foreground">{t('common.chat')}</h2>
      <ChatInput
        mentionDropdownSide="bottom"
        message={message}
        attachments={attachmentItems}
        mentions={mentions}
        mentionResults={mentionSearch.results}
        isMentionActive={isMentionActive}
        isMentionSearching={mentionSearch.isLoading}
        isSending={sendMutation.isPending}
        isRecording={isRecording}
        isTranscribingAudio={transcribeMutation.isPending}
        errorMessage={inputError}
        onMessageChange={(value) => {
          setMessage(value);
          if (inputError) setInputError(null);
        }}
        onSend={() => {
          if (!sendMutation.isPending && !transcribeMutation.isPending && !isRecording) {
            sendMutation.mutate();
          }
        }}
        onSelectAttachments={(files) => {
          if (files.length === 0) return;
          setInputError(null);
          setAttachments((prev) => [
            ...prev,
            ...files.map((file) => ({
              id: `${file.name}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
              file,
            })),
          ]);
        }}
        onToggleRecording={() => {
          if (isRecording) {
            stopRecording();
          } else {
            void startRecording().catch(() =>
              setInputError(t('home.chat.errors.micDenied')),
            );
          }
        }}
        onRemoveAttachment={(id) =>
          setAttachments((prev) => prev.filter((a) => a.id !== id))
        }
        onMentionSelect={(item: MentionSearchResultItem) => {
          if (mentions.some((m) => m.id === item.id && m.type === item.type)) return;
          setMentions((prev) => [...prev, { type: item.type, id: item.id, label: item.label }]);
        }}
        onRemoveMention={(id) =>
          setMentions((prev) => prev.filter((m) => m.id !== id))
        }
        onMentionQueryChange={(query, active) => {
          setMentionQuery(query);
          setIsMentionActive(active);
        }}
      />
    </section>
  );
}
