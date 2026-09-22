import { Loader2 } from 'lucide-react';
import { ChatMarkdownContent } from '@/components/molecules/chat-markdown-content';
import { ExtractionReviewForm } from '@/components/organisms/extraction-review-form';
import { usePendingExtractionReview } from '@/hooks/use-extraction-review';
import type { ChatMessageViewModel } from '@/types/dosage-chat';

interface HistoricalExtractionReviewBubbleProps {
  readonly message: ChatMessageViewModel;
}

/**
 * Renders an assistant message that originally produced an extraction review form.
 * After a chat refresh we GET the pending record and show the editable form again
 * (if still in Redis), otherwise the bubble degrades to plain markdown.
 */
export function HistoricalExtractionReviewBubble({
  message,
}: HistoricalExtractionReviewBubbleProps) {
  const { data: payload, isLoading } = usePendingExtractionReview(message.extractionReviewId);

  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(90%,640px)] rounded-2xl bg-muted px-4 py-2.5 text-sm leading-relaxed text-foreground">
        {message.content && <ChatMarkdownContent content={message.content} />}
        {isLoading && (
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Recupero del form di revisione…</span>
          </div>
        )}
        {!isLoading && payload && <ExtractionReviewForm payload={payload} status="editing" />}
        {!isLoading && !payload && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            La revisione non è più disponibile (scaduta o già completata).
          </p>
        )}
        <span className="mt-1 block text-[10px] text-muted-foreground">{message.timestamp}</span>
      </div>
    </div>
  );
}
