import { tavily, type TavilySearchResponse } from '@tavily/core';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { createChatModel } from '../llm-model-factory';
import { hasChatLlmApiKey } from '../llm-config';

const MAX_CANDIDATES = 3;
const JUDGE_MODEL = process.env.OPENAI_MODEL_CLASSIFIER ?? 'gpt-4o-mini';

const JUDGE_PROMPT = `
You receive a fertilizer commercial product name and up to {n} candidate web results.
Pick the index (0-based) of the candidate that is most likely the official technical
data sheet ("scheda tecnica") or product label of the fertilizer. Prefer:
- direct PDF links over generic pages
- manufacturer / distributor websites over marketplaces
- titles or snippets that explicitly mention the product name

Return strict JSON: {{"index": <int>, "confidence": "high" | "medium" | "low"}}
If none match, return {{"index": -1, "confidence": "low"}}.

Product name: {productName}

Candidates:
{candidates}

{format_instructions}
`;

export interface FertilizerLabelCandidate {
  readonly url: string;
  readonly title: string;
  readonly snippet: string;
}

export interface FertilizerLabelLookupResult {
  readonly url: string;
  readonly title: string;
  readonly confidence: 'high' | 'medium' | 'low';
}

interface JudgeOutput {
  readonly index: number;
  readonly confidence: 'high' | 'medium' | 'low';
}

export async function findFertilizerLabelUrl(
  productName: string,
): Promise<FertilizerLabelLookupResult | null> {
  const tavilyApiKey = process.env.TAVILY_API_KEY;
  if (!tavilyApiKey) {
    console.warn('[ENSURE-LABEL][TAVILY-FERT] TAVILY_API_KEY not configured');
    return null;
  }
  const trimmed = productName.trim();
  if (trimmed.length < 2) return null;

  const candidates = await searchCandidates(trimmed, tavilyApiKey);
  if (candidates.length === 0) {
    console.warn(`[ENSURE-LABEL][TAVILY-FERT] No candidates for "${trimmed}"`);
    return null;
  }

  const judged = await judgeCandidates(trimmed, candidates);
  if (judged === null) {
    return { url: candidates[0].url, title: candidates[0].title, confidence: 'low' };
  }
  const picked = candidates[judged.index];
  return { url: picked.url, title: picked.title, confidence: judged.confidence };
}

async function searchCandidates(
  productName: string,
  apiKey: string,
): Promise<ReadonlyArray<FertilizerLabelCandidate>> {
  const client = tavily({ apiKey });
  const query = `"${productName}" scheda tecnica fertilizzante etichetta filetype:pdf`;
  try {
    const response: TavilySearchResponse = await client.search(query, {
      maxResults: MAX_CANDIDATES,
      searchDepth: 'advanced',
      includeAnswer: false,
      includeRawContent: false,
      includeImages: false,
    });
    const results = response.results ?? [];
    return results.slice(0, MAX_CANDIDATES).map((r) => ({
      url: r.url,
      title: r.title ?? '',
      snippet: (r.content ?? '').slice(0, 400),
    }));
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown Tavily error';
    console.warn(`[ENSURE-LABEL][TAVILY-FERT] Search failed: ${reason}`);
    return [];
  }
}

async function judgeCandidates(
  productName: string,
  candidates: ReadonlyArray<FertilizerLabelCandidate>,
): Promise<JudgeOutput | null> {
  if (!hasChatLlmApiKey()) {
    return null;
  }
  const parser = new JsonOutputParser<JudgeOutput>();
  const prompt = PromptTemplate.fromTemplate(JUDGE_PROMPT);
  const { model: llm } = createChatModel({
    modelName: JUDGE_MODEL,
    temperature: 0,
    maxTokens: 200,
    timeout: 30_000,
  });
  const chain = prompt.pipe(llm).pipe(parser);
  const candidateLines = candidates
    .map((c, i) => `${i}. URL=${c.url}\n   TITLE=${c.title}\n   SNIPPET=${c.snippet}`)
    .join('\n');
  try {
    const out = await chain.invoke({
      n: String(candidates.length),
      productName,
      candidates: candidateLines,
      format_instructions: parser.getFormatInstructions(),
    });
    if (typeof out.index !== 'number' || out.index < 0 || out.index >= candidates.length) {
      return null;
    }
    const confidence = normalizeConfidence(out.confidence);
    return { index: out.index, confidence };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown LLM judge error';
    console.warn(`[ENSURE-LABEL][TAVILY-FERT] Judge failed: ${reason}`);
    return null;
  }
}

function normalizeConfidence(value: unknown): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'medium' || value === 'low') return value;
  return 'low';
}
