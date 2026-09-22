import { useEffect, useMemo, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  useDeleteDosageChatMutation,
  useDosageChatDetailQuery,
  useDosageChatsQuery,
} from '@/hooks/use-dosage-chat';
import { postAgentChatStreamWithFiles } from '@/lib/agent-chat-stream';
import { sanitizeUserFacingText } from '@/lib/safe-display';
import { mapChatMessages, mapChatsToHistoryItems } from '@/types/dosage-chat';
import type { JobOperationRow } from './types';

interface JobDosageChatPanelProps {
  readonly jobId: string | null;
  readonly selectedJobs: readonly JobOperationRow[];
}

export function JobDosageChatPanel({ jobId, selectedJobs }: JobDosageChatPanelProps) {
  const chatsQuery = useDosageChatsQuery();
  const deleteMutation = useDeleteDosageChatMutation();
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [isDraftChatActive, setIsDraftChatActive] = useState(false);
  const [draftMessage, setDraftMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [draftThreadId, setDraftThreadId] = useState(
    () => `job-dosage-${jobId ?? 'global'}-${crypto.randomUUID()}`,
  );
  const chatItems = mapChatsToHistoryItems(chatsQuery.data?.data ?? []);
  const chatDetailQuery = useDosageChatDetailQuery(selectedChatId);
  const messages = useMemo(
    () => mapChatMessages(chatDetailQuery.data?.data.messages ?? []),
    [chatDetailQuery.data?.data.messages],
  );
  useEffect(() => {
    if (!chatItems.length) {
      setSelectedChatId(null);
      return;
    }
    if (isDraftChatActive) return;
    if (!selectedChatId || !chatItems.some((chat) => chat.id === selectedChatId)) {
      setSelectedChatId(chatItems[0].id);
    }
  }, [chatItems, isDraftChatActive, selectedChatId]);
  async function handleSendMessage(): Promise<void> {
    if (isSending) return;
    const message = draftMessage.trim();
    if (!message) {
      setErrorMessage('Inserisci un messaggio prima di inviare.');
      return;
    }
    setErrorMessage(null);
    setIsSending(true);
    try {
      const activeThreadId = selectedChatId ? (chatDetailQuery.data?.data.threadId ?? null) : draftThreadId;
      if (!activeThreadId) {
        throw new Error('Thread chat non disponibile.');
      }
      await postAgentChatStreamWithFiles({
        threadId: activeThreadId,
        message,
        files: [],
        // Job-scoped chat is always agricultural; jobId forces the dosage agent
        // on the BE regardless of workspace-kind routing.
        jobId: jobId ?? undefined,
      });
      setDraftMessage('');
      const refreshedList = await chatsQuery.refetch();
      if (!selectedChatId) {
        const createdChat = refreshedList.data?.data?.find((chat) => chat.threadId === draftThreadId);
        if (createdChat) {
          setIsDraftChatActive(false);
          setSelectedChatId(createdChat.id);
        }
      }
      await chatDetailQuery.refetch();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingText(error instanceof Error ? error.message : "Errore durante l'invio del messaggio."),
      );
    } finally {
      setIsSending(false);
    }
  }
  function handleStartNewChat(): void {
    setIsDraftChatActive(true);
    setSelectedChatId(null);
    setDraftMessage('');
    setErrorMessage(null);
    setDraftThreadId(`job-dosage-${jobId ?? 'global'}-${crypto.randomUUID()}`);
  }
  async function handleDeleteChat(): Promise<void> {
    if (!selectedChatId || deleteMutation.isPending) return;
    const currentChatId = selectedChatId;
    try {
      await deleteMutation.mutateAsync(currentChatId);
      setSelectedChatId(null);
      await chatsQuery.refetch();
    } catch (error) {
      setErrorMessage(
        sanitizeUserFacingText(error instanceof Error ? error.message : 'Eliminazione chat non riuscita.'),
      );
    }
  }
  return (
    <div className="grid h-full min-h-0 gap-3 md:grid-cols-[16rem_1fr]">
      <aside className="min-h-0 rounded-md border bg-card">
        <div className="border-b px-3 py-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Chat dosaggio</h3>
            <Button type="button" size="sm" variant="outline" onClick={handleStartNewChat}>
              Nuova
            </Button>
          </div>
        </div>
        <div className="min-h-0 max-h-64 overflow-auto p-2 md:max-h-none">
          {chatsQuery.isPending ? (
            <p className="text-xs text-muted-foreground">Caricamento chat...</p>
          ) : chatItems.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nessuna chat disponibile.</p>
          ) : (
            <div className="space-y-1">
              {chatItems.map((chat) => (
                <button
                  key={chat.id}
                  type="button"
                  onClick={() => {
                    setIsDraftChatActive(false);
                    setSelectedChatId(chat.id);
                  }}
                  className={`w-full rounded-md px-2 py-1.5 text-left text-xs ${
                    selectedChatId === chat.id ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                  }`}
                >
                  {chat.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>
      <section className="flex min-h-0 flex-col rounded-md border bg-card">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <p className="text-xs text-muted-foreground">
            Contesto selezione: {selectedJobs.length} operazioni {jobId ? `- gruppo ${jobId}` : ''}
          </p>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={handleDeleteChat}
            disabled={!selectedChatId || deleteMutation.isPending}
          >
            <Trash2 className="mr-1 h-4 w-4" />
            Elimina
          </Button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-3 py-2">
          {selectedChatId && chatDetailQuery.isPending ? (
            <p className="text-sm text-muted-foreground">Caricamento messaggi...</p>
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Inizia una nuova conversazione di dosaggio.</p>
          ) : (
            <div className="space-y-3">
              {messages.map((message) => (
                <div key={message.id} className="rounded-md border px-2 py-1.5 text-sm">
                  <div className="mb-1 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                    {message.role} - {message.timestamp}
                  </div>
                  <p className="whitespace-pre-wrap wrap-break-word">{message.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2 border-t px-3 py-3">
          <Textarea
            value={draftMessage}
            onChange={(event) => setDraftMessage(event.target.value)}
            placeholder="Scrivi un messaggio per la chat dosaggio..."
            rows={3}
            disabled={isSending}
          />
          {errorMessage ? <p className="text-xs text-destructive">{errorMessage}</p> : null}
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={() => void handleSendMessage()} disabled={isSending}>
              {isSending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              Invia
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
