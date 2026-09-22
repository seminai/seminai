import { UserRole } from '@prisma/client';

/**
 * User roles allowed to manage product labels (etichette): modifying label data
 * and enabling the LABELS module on a workspace. Single source of truth shared by
 * the label routes and the workspace use-cases.
 */
export const LABEL_MODIFY_ROLES: readonly UserRole[] = [
  UserRole.ADMIN,
  UserRole.GOD,
  UserRole.LABEL_MANAGER,
] as const;
