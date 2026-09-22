import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useWorkspace } from '@/hooks/use-workspace';
import { capture, identifyUser, setGroup } from '@/lib/analytics';

/**
 * Side-effect-only component (renders nothing) that keeps PostHog identity in
 * sync with the authenticated session:
 *  - identifies the user (shared distinct_id with the backend) on login,
 *  - associates the user with the active workspace as a B2B group,
 *  - emits `workspace_switched` when the user changes workspace.
 *
 * Must render inside `WorkspaceProvider` (uses `useWorkspace`).
 */
export function AnalyticsTracker() {
  const { user } = useAuth();
  const { activeWorkspaceId } = useWorkspace();
  const previousWorkspaceId = useRef<string | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    identifyUser({ id: user.id, email: user.email, role: user.role });
  }, [user?.id, user?.email, user?.role]);

  useEffect(() => {
    if (!activeWorkspaceId) return;
    setGroup('workspace', activeWorkspaceId);
    if (previousWorkspaceId.current && previousWorkspaceId.current !== activeWorkspaceId) {
      capture('workspace_switched', { workspace_id: activeWorkspaceId });
    }
    previousWorkspaceId.current = activeWorkspaceId;
  }, [activeWorkspaceId]);

  return null;
}
