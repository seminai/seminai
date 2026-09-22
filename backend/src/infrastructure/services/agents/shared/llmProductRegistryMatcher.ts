import { z } from 'zod';
import { PromptTemplate } from '@langchain/core/prompts';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { callWithFallback } from '../dosage_agent/llmProvider';

const RegistryMatchResultSchema = z.object({
  matchIndex: z
    .number()
    .describe('Indice (0-based) del candidato più simile, oppure -1 se nessuno corrisponde'),
  confidence: z.number().min(0).max(100).describe('Confidenza del match (0-100)'),
  reason: z.string().describe('Breve spiegazione del risultato'),
});

type RegistryMatchResult = z.infer<typeof RegistryMatchResultSchema>;

const parser = StructuredOutputParser.fromZodSchema(RegistryMatchResultSchema);

const PROMPT_TEMPLATE = `Sei un esperto di prodotti fitosanitari italiani.
L'utente ha scritto il nome di un prodotto e devi trovare il corrispondente nel registro ufficiale dei fitosanitari.

PRODOTTO CERCATO: "{searchName}"

CANDIDATI DAL REGISTRO UFFICIALE:
{candidatesList}

REGOLE:
- Trova il candidato che corrisponde al prodotto cercato
- Considera variazioni di nome (maiuscole/minuscole, abbreviazioni, formulazioni diverse)
- Considera che il nome commerciale può differire leggermente (es. "SULFAR" = "SULFAR 80 WG")
- Se il prodotto cercato NON è un fitosanitario (es. fertilizzante, coadiuvante, concime) rispondi con matchIndex -1
- Se nessun candidato corrisponde al prodotto cercato, rispondi con matchIndex -1
- Confidence 90-100: stesso prodotto con certezza
- Confidence 70-89: molto probabile, piccole differenze di nome
- Confidence <70: troppo incerto, meglio non matchare

{format_instructions}
Rispondi SOLO con il JSON richiesto.`;

const promptTemplate = PromptTemplate.fromTemplate(PROMPT_TEMPLATE);

const CONFIDENCE_THRESHOLD = 70;

export interface ProductRegistryCandidate {
  registrationNumber: string;
  productName: string;
}

export interface ProductRegistryMatchResult {
  registrationNumber: string;
  productName: string;
  confidence: number;
  reason: string;
}

/**
 * Uses LLM to find the best matching product in the fitosanitari registry
 * from a pre-filtered list of candidates.
 * Returns null if no match found above confidence threshold.
 */
export async function llmFindBestProductInRegistry(
  searchName: string,
  candidates: ProductRegistryCandidate[],
): Promise<ProductRegistryMatchResult | null> {
  if (candidates.length === 0) return null;

  const candidatesList = candidates
    .map((c, i) => `${i}. "${c.productName}" (reg. ${c.registrationNumber})`)
    .join('\n');

  try {
    const { result } = await callWithFallback<RegistryMatchResult>({
      operation: 'product-name-matcher',
      modelOptions: { temperature: 0, maxTokens: 200 },
      execute: async (llm) => {
        const chain = promptTemplate.pipe(llm).pipe(parser);
        return chain.invoke({
          searchName,
          candidatesList,
          format_instructions: parser.getFormatInstructions(),
        });
      },
    });

    if (
      result.matchIndex < 0 ||
      result.matchIndex >= candidates.length ||
      result.confidence < CONFIDENCE_THRESHOLD
    ) {
      console.log(
        `[LLM-REGISTRY] No match for "${searchName}" (index=${result.matchIndex}, confidence=${result.confidence}): ${result.reason}`,
      );
      return null;
    }

    const matched = candidates[result.matchIndex];
    console.log(
      `[LLM-REGISTRY] Matched "${searchName}" → "${matched.productName}" (${matched.registrationNumber}) confidence=${result.confidence}: ${result.reason}`,
    );
    return {
      registrationNumber: matched.registrationNumber,
      productName: matched.productName,
      confidence: result.confidence,
      reason: result.reason,
    };
  } catch (err) {
    console.warn(
      `[LLM-REGISTRY] All providers failed for "${searchName}":`,
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}
