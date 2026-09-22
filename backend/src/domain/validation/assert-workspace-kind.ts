import { WorkspaceKind } from '@prisma/client';
import { AppError } from '../errors/AppError';

export function assertWorkspaceKind(value: unknown): WorkspaceKind {
  if (value === WorkspaceKind.AGRICULTURAL || value === WorkspaceKind.MANUFACTURING) {
    return value;
  }
  throw AppError.badRequest(
    'kind is required and must be AGRICULTURAL or MANUFACTURING',
    'INVALID_WORKSPACE_KIND',
  );
}
