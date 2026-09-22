import type { Request } from 'express';
import { AppError } from '../../../domain/errors/AppError';

/** Returns the authenticated user id or throws 401. */
export function requireQdcUserId(request: Request): string {
  if (!request.user?.id) {
    throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
  }
  return request.user.id;
}
