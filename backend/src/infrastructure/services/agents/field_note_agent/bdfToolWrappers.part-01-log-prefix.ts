import { createChatModel } from '../../llm-model-factory';
import type { BdfClient } from '../../integrations/bdf/client';
import type { CachedBdfClient } from '../../integrations/bdf/cachedClient';
import type { BdfProdotto } from '../../integrations/bdf/types';
import type { SaMechanismMap } from './rag';

export const LOG_PREFIX = '[BDF-Cache]';

export const CACHE_THRESHOLD = 20;

/**
 * Finds the best matching crop/adversity by name using tiered matching.
 * (Same logic as in integrations/bdf/tools.ts)
 */
export function findBestDirectMatch<T>(
  query: string,
  entries: T[],
  getName: (entry: T) => string,
): T | undefined {
  const queryLower = query.toLowerCase().trim();

  const exact = entries.find((e) => getName(e).toLowerCase() === queryLower);
  if (exact) return exact;

  const startsWith = entries.find((e) => getName(e).toLowerCase().startsWith(queryLower));
  if (startsWith) return startsWith;

  const wordBoundary = entries.find((e) => {
    const name = getName(e).toLowerCase();
    const regex = new RegExp(`\\b${queryLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    return regex.test(name);
  });
  if (wordBoundary) return wordBoundary;

  return entries.find((e) => getName(e).toLowerCase().includes(queryLower));
}

/**
 * Uses LLM to resolve user-provided name to best matching entry.
 * (Same logic as in integrations/bdf/tools.ts)
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

    const match = availableEntries.find((e) => e.code === code);
    return match ? code : null;
  } catch (error) {
    console.error(`${LOG_PREFIX} LLM name resolution failed for "${userInput}":`, error);
    return null;
  }
}

/**
 * Builds a map of SA name (lowercase) → mechanism of action from BDF API data.
 * Uses getSostanzeAttive to get SA codes, then getSostanzaAttivaDati for mechanism details.
 * All calls go through CachedBdfClient (7-day cache) so repeated calls are essentially free.
 */
export async function buildSaMechanismMap(
  client: BdfClient | CachedBdfClient,
  cropId: number,
  products: BdfProdotto[],
): Promise<SaMechanismMap> {
  const map: SaMechanismMap = new Map();

  try {
    // Collect unique SA names from products
    const saNames = new Set<string>();
    for (const p of products) {
      if (p.SA1) saNames.add(p.SA1);
      if (p.SA2) saNames.add(p.SA2);
      if (p.SA3) saNames.add(p.SA3);
    }

    if (saNames.size === 0) return map;

    // Get all SAs for this crop (1 cached API call)
    const allSAs = await client.getSostanzeAttive({ coltura: cropId });

    // Build name → code lookup (case-insensitive)
    const saNameToCode = new Map<string, string>();
    for (const sa of allSAs) {
      saNameToCode.set(sa.DECODIFICA.toLowerCase(), sa.CODICE);
    }

    // Find codes for our product SAs
    const codesToFetch = new Set<string>();
    const nameToCode = new Map<string, string>();
    for (const name of saNames) {
      const code = saNameToCode.get(name.toLowerCase());
      if (code) {
        codesToFetch.add(code);
        nameToCode.set(name.toLowerCase(), code);
      }
    }

    if (codesToFetch.size === 0) return map;

    // Fetch mechanism data in parallel (each call cached individually for 7 days)
    const codeArray = Array.from(codesToFetch);
    const results = await Promise.allSettled(
      codeArray.map((code) => client.getSostanzaAttivaDati(code)),
    );

    // Build code → mechanism map
    const codeToMechanism = new Map<string, string>();
    for (let i = 0; i < codeArray.length; i++) {
      const result = results[i];
      if (result.status === 'fulfilled' && result.value.length > 0) {
        const mechanism = result.value[0].MECCANISMO_AZIONE;
        if (mechanism) {
          codeToMechanism.set(codeArray[i], mechanism);
        }
      }
    }

    // Build final SA name → mechanism map
    for (const name of saNames) {
      const code = nameToCode.get(name.toLowerCase());
      if (code) {
        const mechanism = codeToMechanism.get(code);
        if (mechanism) {
          map.set(name.toLowerCase(), mechanism);
        }
      }
    }

    console.log(
      `${LOG_PREFIX} Built SA mechanism map: ${map.size} mechanisms for ${saNames.size} active substances`,
    );
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to build SA mechanism map (non-blocking):`, error);
  }

  return map;
}

/**
 * Looks up mechanism of action for a product's active substances.
 */
export function getProductMechanisms(product: BdfProdotto, saMechanismMap: SaMechanismMap): string[] {
  const mechanisms = new Set<string>();
  for (const sa of [product.SA1, product.SA2, product.SA3]) {
    if (sa) {
      const mechanism = saMechanismMap.get(sa.toLowerCase());
      if (mechanism) mechanisms.add(mechanism);
    }
  }
  return Array.from(mechanisms);
}
