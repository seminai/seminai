import { X, Archive, MessageSquare } from 'lucide-react';
import { FileTypeIcon } from '@/components/atoms/file-type-icon';
import { cn } from '@/lib/utils';

interface TabItemProps {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly format: string;
  readonly source?: string;
  readonly isActive: boolean;
  readonly closable: boolean;
  readonly onClick: () => void;
  readonly onClose: () => void;
}

export function TabItem({ title, subtitle, format, source, isActive, closable, onClick, onClose }: TabItemProps) {
  return (
    <button
      type="button"
      className={cn(
        'group relative flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-sm transition-colors',
        isActive
          ? 'border-primary text-foreground'
          : 'border-transparent text-muted-foreground hover:text-foreground',
      )}
      onClick={onClick}
    >
      {source === 'chat' ? (
        <MessageSquare className="h-3.5 w-3.5 shrink-0" />
      ) : format === '-' ? (
        <Archive className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <FileTypeIcon format={format} className="h-3.5 w-3.5 shrink-0" />
      )}
      <div className="flex flex-col items-start">
        <span className="max-w-[120px] truncate leading-tight" title={title}>
          {title}
        </span>
        {subtitle ? (
          <span
            className="max-w-[120px] truncate text-[10px] leading-tight text-muted-foreground"
            title={subtitle}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
      {closable && (
        <span
          role="button"
          tabIndex={0}
          className={cn(
            'ml-0.5 rounded p-0.5 transition-colors hover:bg-accent',
            isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onClose();
            }
          }}
        >
          <X className="h-3 w-3" />
        </span>
      )}
    </button>
  );
}
