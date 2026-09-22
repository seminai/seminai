import { useNavigate } from '@tanstack/react-router';
import { useAuth } from '@/hooks/use-auth';
import { useWorkspace } from '@/hooks/use-workspace';
import { WorkspaceSwitcher } from '@/components/molecules/workspace-switcher';
import { UserAvatar } from '@/components/atoms/user-avatar';

export function MobileHeader() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { workspaces, activeWorkspaceId, activeWorkspaceKind, setActiveWorkspaceId } = useWorkspace();

  function handleCreateWorkspace() {
    void navigate({ to: '/workspaces/new' });
  }

  return (
    <header className="flex shrink-0 items-center justify-between border-b bg-background px-3 py-2">
      {/* Left — workspace switcher */}
      <WorkspaceSwitcher
        workspaces={workspaces}
        activeId={activeWorkspaceId}
        activeKind={activeWorkspaceKind}
        onSwitch={setActiveWorkspaceId}
        onCreate={handleCreateWorkspace}
        onSettings={() => navigate({ to: '/settings' })}
      />

      {/* Right — user avatar → settings */}
      <button
        type="button"
        onClick={() => navigate({ to: '/settings' })}
        className="shrink-0"
      >
        <UserAvatar
          src={user?.profilePictureUrl}
          name={user?.name}
          size="md"
        />
      </button>
    </header>
  );
}
