import { Request } from 'express';
import { AppError } from '../../../domain/errors/AppError';

export const requireAuthenticatedUserId = (request: Request): string => {
  if (!request.user?.id) {
    throw AppError.unauthorized('User not authenticated', 'USER_NOT_AUTHENTICATED');
  }
  return request.user.id;
};
