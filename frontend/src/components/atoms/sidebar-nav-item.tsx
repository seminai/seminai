import { cn } from '@/lib/utils';

interface SidebarNavItemProps {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly isActive?: boolean;
  readonly isSoftActive?: boolean;
  readonly collapsed?: boolean;
  readonly onClick: () => void;
}

export function SidebarNavItem({ icon, label, isActive, isSoftActive, collapsed, onClick }: SidebarNavItemProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={collapsed ? label : undefined}
      className={cn(
        'flex items-center rounded-lg text-sm font-medium transition-colors',
        collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
        isActive
          ? 'bg-accent text-accent-foreground'
          : isSoftActive
            ? 'bg-accent/50 text-foreground'
            : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {icon}
      {!collapsed && label}
    </button>
  );
}
