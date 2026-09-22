/**
 * Returns the JWT secret from environment variables.
 * Throws at call-time if JWT_SECRET is not set, preventing token signing
 * with a weak/default fallback.
 */
export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return secret;
}
