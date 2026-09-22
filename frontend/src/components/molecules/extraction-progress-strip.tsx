import { Loader2 } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import type { ChatExtractionProgressEntry } from '@/hooks/use-chat-extraction-progress';

interface ExtractionProgressStripProps {
  readonly entry: ChatExtractionProgressEntry;
}

/**
 * Inline strip rendered inside the chat to surface live updates from the async
 * extraction worker (`agent:extraction_progress`). Disappears as soon as the
 * worker emits complete/failed (the parent hook clears the entry).
 */
export function ExtractionProgressStrip({ entry }: ExtractionProgressStripProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(entry.progress)));
  return (
    <div className="flex justify-start">
      <div className="min-w-0 max-w-[min(90%,640px)] rounded-2xl border border-border bg-muted/50 px-4 py-2.5 text-sm leading-relaxed text-foreground">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          <span className="font-medium">Elaborazione in corso</span>
          <span className="ml-auto tabular-nums">{clamped}%</span>
        </div>
        <Progress value={clamped} className="h-1.5" />
        <p className="mt-1.5 text-[12px] text-muted-foreground">{entry.step}</p>
      </div>
    </div>
  );
}
