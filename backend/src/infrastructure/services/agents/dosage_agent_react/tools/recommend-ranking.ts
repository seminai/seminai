import { createChatModel } from '../../../llm-model-factory';

/**
 * Pluggable weighted-sum ranking for product recommendation.
 * Each dimension is normalized to 0..1; a null/unknown dimension contributes a
 * NEUTRAL 0.5 so missing data never silently penalizes a product.
 */
export interface RankingWeights {
  readonly efficacy: number;
  readonly fracRotation: number;
  readonly bioLowResidue: number;
  readonly stockAvailability: number;
}

export const DEFAULT_WEIGHTS: RankingWeights = {
  efficacy: 0.4,
  fracRotation: 0.25,
  bioLowResidue: 0.2,
  stockAvailability: 0.15,
};

export interface CandidateInput {
  readonly productName: string;
  readonly registrationNumber: string;
  readonly activeIngredients: ReadonlyArray<string>;
  readonly frac: string | null;
  readonly bio: boolean | null;
  readonly carenzaGiorni: number | null;
  readonly fasceRispettoAcqua: string | null;
  readonly inVendita: boolean;
  /** null = stock dimension not evaluated (no userId / weight 0). */
  readonly inStockQty: number | null;
  /** null = no efficacy estimate available. */
  readonly efficacy: number | null;
  readonly source: string;
}

export interface ScoreBreakdown {
  readonly efficacy: number;
  readonly fracRotation: number;
  readonly bioLowResidue: number;
  readonly stock: number;
}

export interface RankedCandidate extends CandidateInput {
  readonly score: number;
  readonly scoreBreakdown: ScoreBreakdown;
}

export interface RankingOptions {
  readonly weights: RankingWeights;
  readonly fracRotationAvoid: ReadonlyArray<string>;
  readonly preferBio: boolean;
  readonly preferLowResidue: boolean;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function efficacyScore(c: CandidateInput): number {
  return c.efficacy ?? 0.5;
}

/**
 * Canonicalizes a FRAC/MoA expression into a set of comparable tokens.
 * Splits on separators (mixtures like "3 + 9", "FRAC 11") and strips leading
 * zeros from the numeric part so "M01" ≡ "M1" and "03" ≡ "3". Deterministic and
 * order-independent — replaces the previous substring matching, which matched
 * "M1" ⊂ "M01" in one direction only.
 */
function fracTokenSet(frac: string): Set<string> {
  return new Set(
    frac
      .toUpperCase()
      .split(/[^A-Z0-9]+/)
      .filter(Boolean)
      .map((token) => token.replace(/^([A-Z]*)0*(\d+)$/, '$1$2'))
      .filter((token) => token.length > 0 && token !== 'FRAC'),
  );
}

function fracScore(c: CandidateInput, avoid: ReadonlyArray<string>): number {
  if (!c.frac) return 0.5; // unknown → neutral
  const candidateTokens = fracTokenSet(c.frac);
  if (candidateTokens.size === 0) return 0.5;
  const avoidTokens = new Set(avoid.flatMap((a) => (a ? [...fracTokenSet(a)] : [])));
  for (const token of candidateTokens) {
    if (avoidTokens.has(token)) return 0;
  }
  return 1;
}

function bioLowResidueScore(
  c: CandidateInput,
  preferBio: boolean,
  preferLowResidue: boolean,
): number {
  const bioScore = c.bio === true ? 1 : c.bio === false ? 0 : 0.5;
  const residueScore = c.carenzaGiorni != null ? clamp01(1 - c.carenzaGiorni / 30) : 0.5;
  if (preferBio && !preferLowResidue) return 0.7 * bioScore + 0.3 * residueScore;
  if (preferLowResidue && !preferBio) return 0.3 * bioScore + 0.7 * residueScore;
  return 0.5 * bioScore + 0.5 * residueScore;
}

function stockScore(c: CandidateInput): number {
  if (c.inStockQty == null) return 0.5; // not evaluated → neutral
  return c.inStockQty > 0 ? 1 : 0;
}

function normalizeWeights(w: RankingWeights): RankingWeights {
  const total = w.efficacy + w.fracRotation + w.bioLowResidue + w.stockAvailability;
  if (total <= 0) return DEFAULT_WEIGHTS;
  return {
    efficacy: w.efficacy / total,
    fracRotation: w.fracRotation / total,
    bioLowResidue: w.bioLowResidue / total,
    stockAvailability: w.stockAvailability / total,
  };
}

export function rankCandidates(
  candidates: ReadonlyArray<CandidateInput>,
  options: RankingOptions,
): RankedCandidate[] {
  const w = normalizeWeights(options.weights);
  const ranked = candidates.map((c) => {
    const breakdown: ScoreBreakdown = {
      efficacy: efficacyScore(c),
      fracRotation: fracScore(c, options.fracRotationAvoid),
      bioLowResidue: bioLowResidueScore(c, options.preferBio, options.preferLowResidue),
      stock: stockScore(c),
    };
    const score =
      w.efficacy * breakdown.efficacy +
      w.fracRotation * breakdown.fracRotation +
      w.bioLowResidue * breakdown.bioLowResidue +
      w.stockAvailability * breakdown.stock;
    return { ...c, score: Math.round(score * 1000) / 1000, scoreBreakdown: breakdown };
  });
  return ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return Number(b.inVendita) - Number(a.inVendita);
  });
}

function extractJson(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Estimates agronomic efficacy (0..1) per candidate via a single LLM call.
 * This is a HEURISTIC estimate, not label data — callers must surface that
 * caveat. Returns a map keyed by registration number; empty on failure.
 */
export async function estimateEfficacy(
  candidates: ReadonlyArray<{
    readonly registrationNumber: string;
    readonly productName: string;
    readonly activeIngredients: ReadonlyArray<string>;
  }>,
  cropName: string,
  adversityName: string,
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (candidates.length === 0) return result;
  try {
    const { model } = createChatModel({ modelName: 'gpt-4o-mini', temperature: 0, maxTokens: 600 });
    const list = candidates
      .map(
        (c, i) =>
          `${i}: ${c.productName} [${c.activeIngredients.join(', ') || 'n/d'}] (reg ${c.registrationNumber})`,
      )
      .join('\n');
    const response = await model.invoke([
      {
        role: 'system',
        content:
          "Sei un agronomo esperto di difesa fitosanitaria. Stima l'efficacia ATTESA di ciascun prodotto " +
          "contro l'avversità indicata sulla coltura indicata, basandoti sui principi attivi. " +
          'Rispondi SOLO con un oggetto JSON {"scores": {"<indice>": <0..1>}} senza testo aggiuntivo. ' +
          '1 = molto efficace, 0 = inefficace o non indicato.',
      },
      {
        role: 'user',
        content: `Coltura: ${cropName}\nAvversità: ${adversityName}\nProdotti:\n${list}\n\nJSON:`,
      },
    ]);
    const parsed = extractJson(response.content.toString());
    const scores = parsed?.scores as Record<string, unknown> | undefined;
    if (scores) {
      candidates.forEach((c, i) => {
        const v = Number(scores[String(i)]);
        if (Number.isFinite(v)) result.set(c.registrationNumber, clamp01(v));
      });
    }
  } catch (err) {
    console.warn(
      '[recommend] efficacy LLM estimate failed:',
      err instanceof Error ? err.message : err,
    );
  }
  return result;
}
