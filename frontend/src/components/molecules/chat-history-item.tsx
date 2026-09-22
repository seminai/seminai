import { MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ChatHistoryItemProps {
  readonly title: string;
  readonly isActive?: boolean;
  readonly onClick: () => void;
  readonly onRename?: () => void;
  readonly onDelete?: () => void;
}

export function ChatHistoryItem({
  title,
  isActive,
  onClick,
  onRename,
  onDelete,
}: ChatHistoryItemProps) {
  const hasActions = Boolean(onRename) || Boolean(onDelete);

  return (
    <div
      className={cn(
        'group flex cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
      onClick={onClick}
    >
      <MessageSquare className="h-4 w-4 shrink-0" />
      <span className="flex-1 truncate">{title}</span>
      {hasActions && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon-xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
              />
            }
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onRename && (
              <DropdownMenuItem onClick={onRename}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Rinomina
              </DropdownMenuItem>
            )}
            {onDelete && (
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Elimina
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
