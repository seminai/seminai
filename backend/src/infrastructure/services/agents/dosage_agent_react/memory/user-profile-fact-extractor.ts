const MAX_PROFESSIONAL_CONTEXT_LENGTH = 80;

const PROFESSIONAL_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\bmi occupo di\s+([^,.;!?]+)/i,
  /\blavoro (?:in|nel|nella|come)\s+([^,.;!?]+)/i,
  /\bsono (?:un|una|uno)\s+([^,.;!?]+)/i,
  /\bil mio ambito (?:e|è)\s+([^,.;!?]+)/i,
] as const;

function normalizeProfessionalContext(value: string): string | null {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length < 2) return null;
  return normalized.slice(0, MAX_PROFESSIONAL_CONTEXT_LENGTH);
}

/**
 * Extracts stable professional context explicitly stated by the user.
 */
export function extractProfessionalContext(message: string): string | null {
  for (const pattern of PROFESSIONAL_CONTEXT_PATTERNS) {
    const match = message.match(pattern);
    const context = match?.[1] ? normalizeProfessionalContext(match[1]) : null;
    if (context) return context;
  }
  return null;
}
