import { Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarFolderItemProps {
  readonly name: string;
  readonly isActive: boolean;
  readonly collapsed: boolean;
  readonly onClick: () => void;
}

export function SidebarFolderItem({ name, isActive, collapsed, onClick }: SidebarFolderItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? name : undefined}
      className={cn(
        'flex items-center rounded-lg text-sm transition-colors',
        collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
        isActive
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      <Folder className="h-5 w-5 shrink-0" />
      {!collapsed && <span className="truncate">{name}</span>}
    </button>
  );
}
