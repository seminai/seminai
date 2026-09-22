import { LogOut, Settings } from 'lucide-react';
import { useNavigate, useRouter } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import { usePostAuthLogout } from '@/generated/api/auth/auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { UserAvatar } from '@/components/atoms/user-avatar';

interface SidebarUserMenuProps {
  readonly collapsed?: boolean;
}

export function SidebarUserMenu({ collapsed }: SidebarUserMenuProps) {
  const { t } = useTranslation();
  const router = useRouter();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const logoutMutation = usePostAuthLogout();
  const displayName = user?.name ?? 'User';

  const handleOpenSettings = async () => {
    await navigate({ to: '/settings' });
  };

  const handleLogout = async () => {
    await logoutMutation.mutateAsync();
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: '/login' });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center rounded-lg text-sm font-medium text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
          collapsed ? 'justify-center px-2 py-2' : 'gap-3 px-3 py-2',
        )}
        title={collapsed ? displayName : undefined}
      >
        <UserAvatar
          src={user?.profilePictureUrl}
          name={displayName}
          size="sm"
        />
        {!collapsed && displayName}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start">
        <DropdownMenuItem onClick={handleOpenSettings}>
          <Settings className="mr-2 h-4 w-4" />
          {t('common.settings')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout} disabled={logoutMutation.isPending}>
          <LogOut className="mr-2 h-4 w-4" />
          {t('settings.sidebar.logout')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
