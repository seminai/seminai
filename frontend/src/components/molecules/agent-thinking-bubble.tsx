import { AlertCircle, ShieldAlert, RefreshCw, Ban } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { TypingIndicator } from '@/components/atoms/typing-indicator';
import { AgentToolChip } from '@/components/atoms/agent-tool-chip';
import { ChatMarkdownContent } from '@/components/molecules/chat-markdown-content';
import { ExtractionReviewForm } from '@/components/organisms/extraction-review-form';
import type { TransientAssistantMessage } from '@/types/chat-stream';

interface AgentThinkingBubbleProps {
  readonly assistant: TransientAssistantMessage;
  readonly onApprove?: () => void;
  readonly onReject?: () => void;
  readonly onRetry?: () => void;
}

const RISK_LABEL: Record<'low' | 'medium' | 'high', string> = {
  low: 'Rischio basso',
  medium: 'Rischio medio',
  high: 'Rischio alto',
};

const RISK_BADGE_CLASS: Record<'low' | 'medium' | 'high', string> = {
  low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  high: 'bg-destructive/15 text-destructive',
};

function formatTimestamp(iso: string): string {
  try {
    return new Intl.DateTimeFormat('it-IT', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
}

export function AgentThinkingBubble({ assistant, onApprove, onReject, onRetry }: AgentThinkingBubbleProps) {
  const hasContent = assistant.content.trim().length > 0;
  const hasTools = assistant.toolCalls.length > 0;
  const showTypingIndicator = !hasContent && (assistant.status === 'thinking' || assistant.status === 'streaming');
  const isApproval = assistant.status === 'requires_approval';
  const isError = assistant.status === 'error';
  const isCancelled = assistant.status === 'cancelled';

  return (
    <div className="flex justify-start">
      <div
        className={cn(
          'min-w-0 max-w-[min(90%,640px)] rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          'bg-muted text-foreground',
        )}
      >
        {assistant.pipelineProgress && (
          <div className="mb-2 text-[11px] text-muted-foreground">
            Step {assistant.pipelineProgress.currentStep} di {assistant.pipelineProgress.totalSteps}
            {assistant.pipelineProgress.stepName ? ` · ${assistant.pipelineProgress.stepName}` : ''}
          </div>
        )}

        {hasTools && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {assistant.toolCalls.map((tool) => (
              <AgentToolChip key={tool.id} toolName={tool.name} labelIt={tool.labelIt} status={tool.status} />
            ))}
          </div>
        )}

        {showTypingIndicator && (
          <div className="py-1.5">
            <TypingIndicator />
          </div>
        )}

        {hasContent && <ChatMarkdownContent content={assistant.content} />}

        {assistant.extractionReview && (
          <ExtractionReviewForm
            payload={assistant.extractionReview.payload}
            status={assistant.extractionReview.status}
          />
        )}

        {isApproval && assistant.pendingToolCalls.length > 0 && (
          <div className="mt-3 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-800 dark:text-amber-200">
              <ShieldAlert className="h-3.5 w-3.5" />
              <span>Conferma richiesta</span>
              {assistant.pendingToolCalls[0] && (
                <span
                  className={cn(
                    'ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                    RISK_BADGE_CLASS[assistant.pendingToolCalls[0].riskLevel],
                  )}
                >
                  {RISK_LABEL[assistant.pendingToolCalls[0].riskLevel]}
                </span>
              )}
            </div>
            <ul className="space-y-1 text-xs text-amber-900 dark:text-amber-200">
              {assistant.pendingToolCalls.map((pending) => (
                <li key={pending.id}>· {pending.labelIt}</li>
              ))}
            </ul>
            <div className="flex gap-2 pt-1">
              <Button size="sm" variant="default" onClick={onApprove} disabled={!onApprove}>
                Approva
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} disabled={!onReject}>
                Rifiuta
              </Button>
            </div>
          </div>
        )}

        {isError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div className="flex-1 space-y-2">
              <p>{assistant.errorMessage ?? 'Errore durante la generazione della risposta.'}</p>
              {onRetry && (
                <Button size="sm" variant="outline" onClick={onRetry}>
                  <RefreshCw className="mr-1.5 h-3 w-3" />
                  Riprova
                </Button>
              )}
            </div>
          </div>
        )}

        {isCancelled && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <Ban className="h-3.5 w-3.5 shrink-0" />
            <span>Annullato dall'utente.</span>
            {onRetry && (
              <Button size="sm" variant="ghost" className="ml-auto" onClick={onRetry}>
                <RefreshCw className="mr-1.5 h-3 w-3" />
                Riprova
              </Button>
            )}
          </div>
        )}

        <span className="mt-1 block text-[10px] text-muted-foreground">{formatTimestamp(assistant.createdAtIso)}</span>
      </div>
    </div>
  );
}
