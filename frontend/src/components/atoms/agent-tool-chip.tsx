import { Loader2, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { resolveToolLabel } from '@/constants/agent-tool-labels';
import type { TransientToolStatus } from '@/types/chat-stream';

interface AgentToolChipProps {
  readonly toolName: string;
  readonly labelIt?: string;
  readonly status: TransientToolStatus;
}

const STATUS_CLASSES: Record<TransientToolStatus, string> = {
  running: 'bg-muted/50 border-muted-foreground/15 text-foreground',
  completed: 'bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/30 dark:border-emerald-900 dark:text-emerald-300',
  error: 'bg-destructive/10 border-destructive/30 text-destructive',
};

export function AgentToolChip({ toolName, labelIt, status }: AgentToolChipProps) {
  const definition = resolveToolLabel(toolName);
  const label = labelIt ?? definition.labelIt;
  const ToolIcon = definition.icon;

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
        STATUS_CLASSES[status],
      )}
    >
      {status === 'running' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : status === 'completed' ? (
        <Check className="h-3 w-3" />
      ) : (
        <AlertCircle className="h-3 w-3" />
      )}
      <ToolIcon className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}
