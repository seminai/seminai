import { useAuth } from '@/hooks/use-auth';

const LABEL_MANAGEMENT_ROLES = ['ADMIN', 'GOD', 'LABEL_MANAGER'] as const;

/**
 * Whether the current user may modify product labels (edit / verify / delete / create).
 * Mirrors the backend `LABEL_MODIFY_ROLES`. Read access stays open to all workspace members.
 */
export function useCanModifyLabels(): boolean {
  const { user } = useAuth();
  return user ? (LABEL_MANAGEMENT_ROLES as readonly string[]).includes(user.role) : false;
}
