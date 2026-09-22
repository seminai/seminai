import { ExternalLink } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { ChatMarkdownContent } from '@/components/molecules/chat-markdown-content';
import type { ChatMessageViewModel } from '@/types/dosage-chat';

interface HistoricalExtractionArchivedBubbleProps {
  readonly message: ChatMessageViewModel;
}

/**
 * Renders an assistant message produced by the chat-extraction commit flow.
 * Surfaces a TanStack-Router-aware "Apri scheda" button so the user can jump
 * to the archive detail page without a full page reload, while keeping the
 * conversation context intact.
 */
export function HistoricalExtractionArchivedBubble({
  message,
}: HistoricalExtractionArchivedBubbleProps) {
  const pageId = message.archivedExtractionId;
  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(90%,640px)] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
        {message.content && <ChatMarkdownContent content={message.content} />}
        {pageId && (
          <Link
            to="/archivio/$pageId"
            params={{ pageId }}
            className="mt-1 inline-flex items-center gap-1 text-primary underline underline-offset-4 hover:no-underline"
          >
            Apri scheda nell&apos;archivio
            <ExternalLink className="h-3 w-3" />
          </Link>
        )}
        <span className="mt-1 block text-[10px] text-muted-foreground">{message.timestamp}</span>
      </div>
    </div>
  );
}
