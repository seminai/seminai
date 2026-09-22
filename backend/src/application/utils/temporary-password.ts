const TEMPORARY_PASSWORD_LENGTH = 12;
const TEMPORARY_PASSWORD_CHARSET =
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%&*';

/**
 * Generates a temporary password for invited local accounts.
 */
export function generateTemporaryPassword(): string {
  let password = '';
  for (let i = 0; i < TEMPORARY_PASSWORD_LENGTH; i++) {
    const randomIndex = Math.floor(Math.random() * TEMPORARY_PASSWORD_CHARSET.length);
    password += TEMPORARY_PASSWORD_CHARSET[randomIndex];
  }
  return password;
}
