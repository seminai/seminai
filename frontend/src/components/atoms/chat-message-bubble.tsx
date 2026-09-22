import { Check, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatMarkdownContent } from '@/components/molecules/chat-markdown-content';
import { ChatAttachmentList } from '@/components/molecules/chat-attachment-list';
import type { ChatAttachmentViewModel } from '@/types/chat-attachment';

export type ChatMessageBubbleStatus = 'pending' | 'sent' | 'error';

interface ChatMessageBubbleProps {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  readonly timestamp: string;
  readonly status?: ChatMessageBubbleStatus;
  readonly attachments?: readonly ChatAttachmentViewModel[];
  readonly onRetry?: () => void;
}

function StatusIcon({ status }: { readonly status: ChatMessageBubbleStatus }) {
  if (status === 'pending') return <Loader2 className="h-3 w-3 animate-spin opacity-70" />;
  if (status === 'error') return <AlertCircle className="h-3 w-3 text-destructive" />;
  return <Check className="h-3 w-3 opacity-70" />;
}

export function ChatMessageBubble({
  role,
  content,
  timestamp,
  status,
  attachments = [],
  onRetry,
}: ChatMessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'min-w-0 rounded-2xl px-4 py-2.5 text-sm leading-relaxed',
          isUser
            ? 'max-w-[75%] bg-primary text-primary-foreground'
            : 'max-w-[min(90%,640px)] bg-muted text-foreground',
        )}
      >
        {isUser ? <p>{content}</p> : <ChatMarkdownContent content={content} />}
        {isUser && (
          <ChatAttachmentList attachments={attachments} isUser={isUser} onRetry={onRetry} />
        )}
        <span
          className={cn(
            'mt-1 flex items-center gap-1 text-[10px]',
            isUser ? 'justify-end text-primary-foreground/60' : 'text-muted-foreground',
          )}
        >
          {timestamp}
          {status && <StatusIcon status={status} />}
        </span>
      </div>
    </div>
  );
}
