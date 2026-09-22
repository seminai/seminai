import { createChatModel } from '../../llm-model-factory';

/**
 * Finds the best matching crop/adversity by name using tiered matching:
 * 1. Exact match (case-insensitive)
 * 2. Starts-with match (e.g. "Vite" → "Vite da uva da vino")
 * 3. Contains match (e.g. "oidio" → "Oidio o Mal bianco della vite")
 */
export function findBestDirectMatch<T>(
  query: string,
  entries: T[],
  getName: (entry: T) => string,
): T | undefined {
  const queryLower = query.toLowerCase().trim();

  // 1. Exact match
  const exact = entries.find((e) => getName(e).toLowerCase() === queryLower);
  if (exact) return exact;

  // 2. Starts-with match (prefer "Vite da uva da vino" over "Foglie di vite" when searching "Vite")
  const startsWith = entries.find((e) => getName(e).toLowerCase().startsWith(queryLower));
  if (startsWith) return startsWith;

  // 3. Word-boundary match (the query appears as a whole word)
  const wordBoundary = entries.find((e) => {
    const name = getName(e).toLowerCase();
    const regex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(name);
  });
  if (wordBoundary) return wordBoundary;

  // 4. Contains match (fallback)
  return entries.find((e) => getName(e).toLowerCase().includes(queryLower));
}

/**
 * Uses LLM (gpt-4o-mini) to resolve a user-provided name to the best matching entry
 * from a list of available items. Handles common name → technical/scientific name resolution.
 * e.g. "oidio" → "Oidio della vite (Erysiphe necator)"
 */
export async function resolveNameWithLlm(
  userInput: string,
  availableEntries: Array<{ code: string; name: string }>,
  context: string,
): Promise<string | null> {
  if (availableEntries.length === 0) return null;

  try {
    const { model } = createChatModel({
      modelName: 'gpt-4o-mini',
      temperature: 0,
      maxTokens: 30,
    });

    const entriesList = availableEntries.map((e) => `${e.code}: ${e.name}`).join('\n');

    const response = await model.invoke([
      {
        role: 'system',
        content:
          `Sei un esperto agronomo. Devi trovare la corrispondenza migliore tra il termine dell'utente e la lista disponibile di ${context}. ` +
          `Il termine potrebbe essere un nome comune, dialettale, abbreviato o scientifico. ` +
          `Rispondi SOLO con il codice della voce che corrisponde meglio. Se non trovi corrispondenza, rispondi NONE.`,
      },
      {
        role: 'user',
        content: `Termine cercato: "${userInput}"\n\nLista ${context} disponibili:\n${entriesList}\n\nCodice:`,
      },
    ]);

    const raw = response.content.toString().trim();
    const code = raw.replace(/[^0-9a-zA-Z_-]/g, '');
    if (!code || code.toUpperCase() === 'NONE') return null;

    // Verify the code exists in the list
    const match = availableEntries.find((e) => e.code === code);
    return match ? code : null;
  } catch (error) {
    console.error(`[BDF] LLM name resolution failed for "${userInput}":`, error);
    return null;
  }
}

export function normalizeDosesPayload(rawDoses: unknown): unknown[] {
  if (Array.isArray(rawDoses)) return rawDoses;
  if (rawDoses && typeof rawDoses === 'object') return [rawDoses];
  return [];
}
