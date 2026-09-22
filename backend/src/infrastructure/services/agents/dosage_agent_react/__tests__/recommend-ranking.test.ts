jest.mock('../../../llm-model-factory', () => ({ createChatModel: jest.fn() }));

import { createChatModel } from '../../../llm-model-factory';
import {
  rankCandidates,
  estimateEfficacy,
  DEFAULT_WEIGHTS,
  type CandidateInput,
  type RankingWeights,
} from '../tools/recommend-ranking';

function makeCandidate(overrides: Partial<CandidateInput> = {}): CandidateInput {
  return {
    productName: 'Prod',
    registrationNumber: '1000',
    activeIngredients: ['rame'],
    frac: null,
    bio: null,
    carenzaGiorni: null,
    fasceRispettoAcqua: null,
    inVendita: true,
    inStockQty: null,
    efficacy: null,
    source: 'bdf',
    ...overrides,
  };
}

const ONLY = (key: keyof RankingWeights): RankingWeights => ({
  efficacy: 0,
  fracRotation: 0,
  bioLowResidue: 0,
  stockAvailability: 0,
  [key]: 1,
});

const baseOptions = {
  fracRotationAvoid: [] as string[],
  preferBio: false,
  preferLowResidue: false,
};

describe('rankCandidates', () => {
  it('ranks higher efficacy first with efficacy-only weights', () => {
    const a = makeCandidate({ registrationNumber: 'A', efficacy: 0.9 });
    const b = makeCandidate({ registrationNumber: 'B', efficacy: 0.1 });

    const ranked = rankCandidates([b, a], { ...baseOptions, weights: ONLY('efficacy') });

    expect(ranked[0].registrationNumber).toBe('A');
    expect(ranked[0].scoreBreakdown.efficacy).toBe(0.9);
    expect(ranked[1].registrationNumber).toBe('B');
  });

  it('zeroes the FRAC score for an avoided mechanism', () => {
    const avoided = makeCandidate({ registrationNumber: 'AVOID', frac: 'M3' });
    const ok = makeCandidate({ registrationNumber: 'OK', frac: 'G1' });

    const ranked = rankCandidates([avoided, ok], {
      ...baseOptions,
      fracRotationAvoid: ['M3'],
      weights: ONLY('fracRotation'),
    });

    expect(ranked[0].registrationNumber).toBe('OK');
    expect(ranked.find((c) => c.registrationNumber === 'AVOID')!.scoreBreakdown.fracRotation).toBe(
      0,
    );
  });

  it('matches FRAC codes order-independently after zero-normalization (M01 ≡ M1)', () => {
    const padded = makeCandidate({ registrationNumber: 'PAD', frac: 'M01' });
    const ranked = rankCandidates([padded], {
      ...baseOptions,
      fracRotationAvoid: ['M1'],
      weights: ONLY('fracRotation'),
    });
    expect(ranked[0].scoreBreakdown.fracRotation).toBe(0);
  });

  it('matches FRAC codes in the reverse direction too (avoid M01 vs frac M1)', () => {
    const bare = makeCandidate({ registrationNumber: 'BARE', frac: 'M1' });
    const ranked = rankCandidates([bare], {
      ...baseOptions,
      fracRotationAvoid: ['M01'],
      weights: ONLY('fracRotation'),
    });
    expect(ranked[0].scoreBreakdown.fracRotation).toBe(0);
  });

  it('does not block a FRAC that merely shares a substring (11 vs 1)', () => {
    const c = makeCandidate({ registrationNumber: 'C', frac: '11' });
    const ranked = rankCandidates([c], {
      ...baseOptions,
      fracRotationAvoid: ['1'],
      weights: ONLY('fracRotation'),
    });
    expect(ranked[0].scoreBreakdown.fracRotation).toBe(1);
  });

  it('blocks one group of a FRAC mixture expression', () => {
    const mix = makeCandidate({ registrationNumber: 'MIX', frac: '3 + 9' });
    const ranked = rankCandidates([mix], {
      ...baseOptions,
      fracRotationAvoid: ['9'],
      weights: ONLY('fracRotation'),
    });
    expect(ranked[0].scoreBreakdown.fracRotation).toBe(0);
  });

  it('gives a neutral 0.5 when a dimension has no data', () => {
    const c = makeCandidate({ inStockQty: null, frac: null });
    const ranked = rankCandidates([c], { ...baseOptions, weights: DEFAULT_WEIGHTS });
    expect(ranked[0].scoreBreakdown.stock).toBe(0.5);
    expect(ranked[0].scoreBreakdown.fracRotation).toBe(0.5);
  });

  it('prefers in-stock products on the stock dimension', () => {
    const inStock = makeCandidate({ registrationNumber: 'IN', inStockQty: 12 });
    const noStock = makeCandidate({ registrationNumber: 'OUT', inStockQty: 0 });

    const ranked = rankCandidates([noStock, inStock], {
      ...baseOptions,
      weights: ONLY('stockAvailability'),
    });

    expect(ranked[0].registrationNumber).toBe('IN');
    expect(ranked[0].scoreBreakdown.stock).toBe(1);
  });

  it('rewards bio + short carenza on the bioLowResidue dimension', () => {
    const bioShort = makeCandidate({ registrationNumber: 'BIO', bio: true, carenzaGiorni: 3 });
    const chemLong = makeCandidate({ registrationNumber: 'CHEM', bio: false, carenzaGiorni: 28 });

    const ranked = rankCandidates([chemLong, bioShort], {
      ...baseOptions,
      preferBio: true,
      weights: ONLY('bioLowResidue'),
    });

    expect(ranked[0].registrationNumber).toBe('BIO');
  });
});

describe('estimateEfficacy', () => {
  afterEach(() => jest.clearAllMocks());

  it('maps LLM JSON scores to registration numbers', async () => {
    (createChatModel as jest.Mock).mockReturnValue({
      model: { invoke: jest.fn().mockResolvedValue({ content: '{"scores":{"0":0.9,"1":0.2}}' }) },
    });

    const map = await estimateEfficacy(
      [
        { registrationNumber: 'A', productName: 'Pa', activeIngredients: ['x'] },
        { registrationNumber: 'B', productName: 'Pb', activeIngredients: ['y'] },
      ],
      'Vite',
      'Peronospora',
    );

    expect(map.get('A')).toBe(0.9);
    expect(map.get('B')).toBe(0.2);
  });

  it('returns an empty map when the LLM call fails', async () => {
    (createChatModel as jest.Mock).mockReturnValue({
      model: { invoke: jest.fn().mockRejectedValue(new Error('boom')) },
    });

    const map = await estimateEfficacy(
      [{ registrationNumber: 'A', productName: 'Pa', activeIngredients: ['x'] }],
      'Vite',
      'Oidio',
    );

    expect(map.size).toBe(0);
  });
});
