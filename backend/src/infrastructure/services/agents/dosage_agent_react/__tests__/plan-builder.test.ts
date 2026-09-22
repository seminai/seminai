import {
  buildExcludedProductsSummary,
  buildMarkdownTable,
  buildSteps,
} from '../tools/plan-builder';
import { createGeneratePlanTool } from '../tools/generate-plan.tool';
import { clearWorkingMemory, updateWorkingMemory } from '../working-memory';

const UNIT_ID = '11111111-1111-4111-8111-111111111111';

function makeDosageResult() {
  return {
    unitProductionId: UNIT_ID,
    cropName: 'Vite',
    areaHa: 1.5,
    products: [
      {
        productName: 'QUADRIS',
        registrationNumber: '019462',
        activeIngredient: 'Azoxystrobin',
        trattamenti: [
          {
            data_distribuzione: '2026-05-20',
            dose: 1.2,
            dosaggio_um: 'kg/ha',
            quantita_totale: 1.8,
          },
        ],
      },
    ],
  };
}

describe('plan-builder excluded products summary', () => {
  it('summarizes products excluded from dosage results', () => {
    const summary = buildExcludedProductsSummary([
      {
        unitProductionId: UNIT_ID,
        cropName: 'Vite',
        products: [],
        excludedProducts: [
          {
            name: 'EVADE',
            regNumber: '006326',
            exclusionReason: 'Prodotto revocato dal Ministero della Salute.',
          },
        ],
      },
    ]);

    expect(summary).toEqual([
      {
        productionUnit: 'Unità produttiva 1',
        cropName: 'Vite',
        productName: 'EVADE',
        registrationNumber: '006326',
        reason: 'Prodotto revocato dal Ministero della Salute.',
      },
    ]);
  });
});

describe('plan-builder user-facing unit labels', () => {
  it('does not leak a production unit UUID in markdown when the unit has no name', () => {
    const steps = buildSteps([makeDosageResult()]);
    const table = buildMarkdownTable(steps, { hasIssues: false, products: [] });

    expect(table).toContain('Unità produttiva 1');
    expect(table).not.toContain(UNIT_ID);
  });

  it('uses the production unit name from working memory in generated markdown', async () => {
    const threadId = 'plan-builder-unit-name';
    clearWorkingMemory(threadId);
    updateWorkingMemory(threadId, {
      inputUnits: [{ id: UNIT_ID, name: 'Vigneto Nord', cropName: 'Vite' }] as never[],
      dosageResults: [makeDosageResult()] as never[],
    });

    const tool = createGeneratePlanTool(threadId);
    const raw = await tool.func({ userRequest: 'Fammi una bozza rapida.' });
    const parsed = JSON.parse(raw);

    expect(parsed.markdownTable).toContain('Vigneto Nord');
    expect(parsed.markdownTable).not.toContain(UNIT_ID);

    clearWorkingMemory(threadId);
  });
});
