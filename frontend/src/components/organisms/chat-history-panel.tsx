import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ChatHistoryItem } from '@/components/molecules/chat-history-item';
import type { ChatHistoryItemViewModel } from '@/types/dosage-chat';

interface ChatHistoryPanelProps {
  readonly activeChatId: string | null;
  readonly chats: readonly ChatHistoryItemViewModel[];
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly onChatSelect: (chat: ChatHistoryItemViewModel) => void;
  readonly onClose: () => void;
}

export function ChatHistoryPanel({
  activeChatId,
  chats,
  isLoading,
  isError,
  onRetry,
  onChatSelect,
  onClose,
}: ChatHistoryPanelProps) {
  return (
    <div className="flex w-72 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between px-4 py-3">
        <h3 className="text-sm font-semibold">Chat passate</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClose}
          title="Chiudi cronologia"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {isLoading && <p className="px-3 py-2 text-sm text-muted-foreground">Caricamento chat...</p>}
        {isError && (
          <div className="px-3 py-2 text-sm text-destructive">
            Errore nel caricamento delle chat.
            <button className="ml-1 underline underline-offset-2" onClick={onRetry}>
              Riprova
            </button>
          </div>
        )}
        {!isLoading && !isError && chats.length === 0 && (
          <p className="px-3 py-2 text-sm text-muted-foreground">Nessuna chat disponibile.</p>
        )}
        {!isLoading &&
          !isError &&
          chats.map((chat) => (
            <ChatHistoryItem
              key={chat.id}
              title={chat.title}
              isActive={chat.id === activeChatId}
              onClick={() => onChatSelect(chat)}
            />
          ))}
      </div>
    </div>
  );
}
