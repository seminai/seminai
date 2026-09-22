import { FileTypeIcon } from '@/components/atoms/file-type-icon';
import { Trash2, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface UploadFileItemProps {
  readonly name: string;
  readonly size: number;
  readonly oversized: boolean;
  readonly onRemove: () => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getExtension(name: string): string {
  const ext = name.split('.').pop();
  return ext ? `.${ext}` : '-';
}

export function UploadFileItem({ name, size, oversized, onRemove }: UploadFileItemProps) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2.5">
      <FileTypeIcon format={getExtension(name)} className="h-5 w-5" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className={cn('text-xs', oversized ? 'text-destructive' : 'text-muted-foreground')}>
          {formatFileSize(size)}
          {oversized && ' \u2022 file troppo pesante'}
        </p>
      </div>
      {oversized && (
        <button className="text-muted-foreground hover:text-foreground" type="button">
          <RefreshCw className="h-4 w-4" />
        </button>
      )}
      <button
        className="text-muted-foreground hover:text-destructive"
        onClick={onRemove}
        type="button"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
