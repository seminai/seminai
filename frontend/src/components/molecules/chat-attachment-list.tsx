import { useEffect, useState } from 'react';
import { AlertCircle, Check, File, FileText, ImageIcon, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBytes } from '@/lib/format-bytes';
import { cn } from '@/lib/utils';
import type { ChatAttachmentViewModel } from '@/types/chat-attachment';

interface ChatAttachmentListProps {
  readonly attachments: readonly ChatAttachmentViewModel[];
  readonly isUser: boolean;
  readonly onRetry?: () => void;
}

function StatusIcon({ status }: Pick<ChatAttachmentViewModel, 'status'>) {
  if (status === 'uploading') return <Loader2 className="h-3.5 w-3.5 animate-spin" />;
  if (status === 'error') return <AlertCircle className="h-3.5 w-3.5 text-destructive" />;
  return <Check className="h-3.5 w-3.5" />;
}

function FileIcon({ attachment }: { readonly attachment: ChatAttachmentViewModel }) {
  if (attachment.kind === 'image') return <ImageIcon className="h-4 w-4" />;
  if (attachment.kind === 'document') return <FileText className="h-4 w-4" />;
  return <File className="h-4 w-4" />;
}

function statusLabel(status: ChatAttachmentViewModel['status']): string {
  if (status === 'uploading') return 'Caricamento';
  if (status === 'error') return 'Errore';
  return 'Inviato';
}

function AttachmentImage({ attachment }: { readonly attachment: ChatAttachmentViewModel }) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(attachment.url ?? null);

  useEffect(() => {
    if (attachment.url) {
      setPreviewUrl(attachment.url);
      return;
    }
    if (!attachment.file || typeof URL.createObjectURL !== 'function') return;
    const objectUrl = URL.createObjectURL(attachment.file);
    setPreviewUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [attachment.file, attachment.url]);

  if (!previewUrl) {
    return (
      <div className="flex aspect-[4/3] w-36 max-w-full items-center justify-center rounded-md border border-current/15 bg-current/10">
        <ImageIcon className="h-5 w-5 opacity-70" />
      </div>
    );
  }

  return (
    <img
      src={previewUrl}
      alt={attachment.name}
      className="aspect-[4/3] w-36 max-w-full rounded-md border border-current/15 object-cover"
      loading="lazy"
    />
  );
}

function AttachmentCard({
  attachment,
  isUser,
}: {
  readonly attachment: ChatAttachmentViewModel;
  readonly isUser: boolean;
}) {
  const content = (
    <div
      className={cn(
        'flex min-w-0 max-w-full items-center gap-2 rounded-lg border px-2.5 py-2',
        isUser
          ? 'border-primary-foreground/15 bg-primary-foreground/10'
          : 'border-border bg-background',
      )}
    >
      <FileIcon attachment={attachment} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{attachment.name}</p>
        <p className="truncate text-[10px] opacity-70">
          {formatBytes(attachment.size)} · {statusLabel(attachment.status)}
        </p>
      </div>
      <StatusIcon status={attachment.status} />
    </div>
  );

  if (!attachment.url) return content;
  return (
    <a href={attachment.url} target="_blank" rel="noreferrer" className="block max-w-full">
      {content}
    </a>
  );
}

export function ChatAttachmentList({
  attachments,
  isUser,
  onRetry,
}: ChatAttachmentListProps) {
  if (attachments.length === 0) return null;
  const hasError = attachments.some((attachment) => attachment.status === 'error');
  return (
    <div className="mt-2 flex max-w-full flex-col gap-2">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="max-w-full">
          {attachment.kind === 'image' ? (
            <div className="space-y-1">
              {attachment.url ? (
                <a href={attachment.url} target="_blank" rel="noreferrer" className="block w-fit">
                  <AttachmentImage attachment={attachment} />
                </a>
              ) : (
                <AttachmentImage attachment={attachment} />
              )}
              <AttachmentCard attachment={attachment} isUser={isUser} />
            </div>
          ) : (
            <AttachmentCard attachment={attachment} isUser={isUser} />
          )}
        </div>
      ))}
      {hasError && onRetry && (
        <Button
          type="button"
          size="icon-xs"
          variant="secondary"
          className="self-end rounded-full"
          title="Riprova invio"
          aria-label="Riprova invio allegati"
          onClick={onRetry}
        >
          <RotateCcw className="h-3 w-3" />
        </Button>
      )}
    </div>
  );
}
