import {
  clearDisciplinariChunkLimitsCache,
  extractDisciplinariChunkLimits,
} from '../infrastructure/services/agents/dosage_agent/disciplinari-chunk-limits-extractor';

describe('disciplinari-chunk-limits-extractor', () => {
  beforeEach(() => {
    clearDisciplinariChunkLimitsCache();
  });

  it('uses injectable llmInvoker for applications limits', async () => {
    let calls = 0;
    const result = await extractDisciplinariChunkLimits({
      text: 'Massimo 2 applicazioni per anno. Intervallo minimo 14 giorni.',
      kind: 'applications',
      context: {
        productName: 'Folpet',
        cropName: 'Vite',
        variety: 'Chardonnay',
        epoca: 'pre fioritura',
        region: 'Piemonte',
      },
      llmInvoker: async () => {
        calls += 1;
        return {
          maxApplications: 2,
          minIntervalDays: 14,
          doseMin: null,
          doseMax: null,
          unitOfMeasure: null,
          found: true,
          evidence: 'Massimo 2 applicazioni',
        };
      },
    });
    expect(calls).toBe(1);
    expect(result.maxApplications).toBe(2);
    expect(result.minIntervalDays).toBe(14);
  });

  it('caches repeated chunk extraction', async () => {
    let calls = 0;
    const params = {
      text: 'Dose massima 1,5 l/ha per trattamento.',
      kind: 'dosage' as const,
      context: {
        productName: 'Rame',
        cropName: 'Vite',
      },
      llmInvoker: async () => {
        calls += 1;
        return {
          maxApplications: null,
          minIntervalDays: null,
          doseMin: null,
          doseMax: 1.5,
          unitOfMeasure: 'l/ha',
          found: true,
          evidence: 'Dose massima 1,5 l/ha',
        };
      },
    };
    await extractDisciplinariChunkLimits(params);
    await extractDisciplinariChunkLimits(params);
    expect(calls).toBe(1);
    expect((await extractDisciplinariChunkLimits(params)).doseMax).toBe(1.5);
  });
});
