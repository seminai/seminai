import { AlertCircle } from 'lucide-react';
import { ChatMarkdownContent } from '@/components/molecules/chat-markdown-content';
import type { ChatMessageViewModel } from '@/types/dosage-chat';

interface HistoricalExtractionFailedBubbleProps {
  readonly message: ChatMessageViewModel;
}

/**
 * Renders an assistant message produced when the async chat extraction worker
 * fails. Replaces the legacy ephemeral toast so the failure stays visible in
 * the conversation and the agent can read it from history (preventing the
 * "ancora in elaborazione" hallucination on subsequent turns).
 */
export function HistoricalExtractionFailedBubble({
  message,
}: HistoricalExtractionFailedBubbleProps) {
  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(90%,640px)] rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm leading-relaxed text-foreground">
        <div className="mb-1 flex items-center gap-1.5 text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          <span className="text-xs font-medium uppercase tracking-wide">Estrazione fallita</span>
        </div>
        {message.content ? (
          <ChatMarkdownContent content={message.content} />
        ) : (
          <p className="text-sm">
            {message.extractionFileName ? `File: ${message.extractionFileName}. ` : ''}
            {message.extractionError ?? 'Errore sconosciuto.'}
          </p>
        )}
        <span className="mt-1 block text-[10px] text-muted-foreground">{message.timestamp}</span>
      </div>
    </div>
  );
}
