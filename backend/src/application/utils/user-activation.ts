import { User } from '../../domain/entities/User';

/**
 * Checks whether a local account was created by an invite but has never logged in.
 */
export function isPendingActivation(user: User): boolean {
  return user.lastAccessAt === null && user.googleId === null;
}
