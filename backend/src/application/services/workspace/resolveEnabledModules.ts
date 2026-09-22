import { UserRole, WorkspaceModule } from '@prisma/client';
import { LABEL_MODIFY_ROLES } from '../../../domain/constants/label-roles';

/**
 * Resolves the modules a workspace may enable. DCA is always present. LABELS is
 * granted only when explicitly requested AND the acting user holds a label-management
 * role; otherwise it is silently dropped (non-privileged callers get [DCA]).
 *
 * @param requested - Modules requested by the client (may be undefined).
 * @param userRole - System role of the acting user (may be undefined).
 * @returns De-duplicated list of allowed modules, always including DCA.
 */
export function resolveEnabledModules(
  requested: WorkspaceModule[] | undefined,
  userRole: UserRole | undefined,
): WorkspaceModule[] {
  const modules = new Set<WorkspaceModule>([WorkspaceModule.DCA]);
  const canManageLabels = userRole !== undefined && LABEL_MODIFY_ROLES.includes(userRole);
  if (canManageLabels && (requested ?? []).includes(WorkspaceModule.LABELS)) {
    modules.add(WorkspaceModule.LABELS);
  }
  return Array.from(modules);
}
