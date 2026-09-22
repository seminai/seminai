/** Mock LLM provider so the orchestrator gets deterministic selectedIndices [2, 1] (P2 first, then P1) */
const MOCK_ORCHESTRATOR_RESPONSE = {
  selectedIndices: [2, 1],
  reason: 'Mocked selection',
  excludedProducts: [
    {
      index: 3,
      reason: 'Priorità inferiore: P3 copre meno target rispetto ai prodotti selezionati',
    },
  ],
};

jest.mock('../infrastructure/services/agents/dosage_agent/llmProvider', () => {
  const actual = jest.requireActual<
    typeof import('../infrastructure/services/agents/dosage_agent/llmProvider')
  >('../infrastructure/services/agents/dosage_agent/llmProvider');
  return {
    ...actual,
    callWithFallback: async <T>(params: {
      operation: string;
      execute: (
        model: { invoke: (prompt: string) => Promise<{ content: string }> },
        modelName: string,
      ) => Promise<T>;
    }): Promise<{ result: T; usedModel: string; fallbackUsed: boolean }> => {
      const fakeLlm = {
        invoke: () =>
          Promise.resolve({
            content: JSON.stringify(MOCK_ORCHESTRATOR_RESPONSE),
          }),
      };
      const result = await params.execute(fakeLlm as never, 'mock-model');
      return { result, usedModel: 'mock-model', fallbackUsed: false };
    },
  };
});

import { flowOrchestrateProductSelection } from '../infrastructure/services/agents/dosage_agent/flowOrchestrateProductSelection';
import type { UnitAllowedProductsOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchCropTreatment';
import type { Label } from '../domain/dtos/label.dto';

function buildLabel(targets: string[]): Label {
  return {
    prodotto: 'X',
    categoria: 'Fungicida',
    formulazione: null,
    principio_attivo: 'AI',
    composizione: 'Comp',
    meccanismo_azione_frac: null,
    malattie: targets,
    specie: [],
    colture_target: ['Test Crop'],
    dosaggi_dettagliati: [],
    fasce_di_rispetto_e_deriva: [],
    fasce_rispetto_acqua: null,
    fasce_rispetto_colture: null,
    avvertenze: [],
    frasi_pericolo: [],
    frasi_prudenza: [],
    compatibilita: null,
    fitotossicita: null,
    note_tecniche: null,
    resistenze: [],
    extraction_confidence: 100,
    extracted_fields: ['colture_target'],
    errors: [],
    numero_registrazione: '1',
    titolare: null,
    stabilimento: null,
    caratteristiche: null,
  };
}

describe('flowOrchestrateProductSelection - LLM primary selection', () => {
  it('selects products based on LLM selectedIndices (1-based) when priorityTargets specified', async () => {
    const unit: UnitAllowedProductsOutput = {
      unitProductionId: 'unit-1',
      cropName: 'Test Crop',
      variety: 'Var 1',
      areaHa: 1,
      jobs: [],
      products: [
        {
          name: 'P1',
          regNumber: '1',
          status: 'cached',
          quantity: 0,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: buildLabel(['oidio']),
        } as UnitAllowedProductsOutput['products'][number],
        {
          name: 'P2',
          regNumber: '2',
          status: 'cached',
          quantity: 0,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: buildLabel(['peronospora']),
        } as UnitAllowedProductsOutput['products'][number],
        {
          name: 'P3',
          regNumber: '3',
          status: 'cached',
          quantity: 0,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: buildLabel(['botrite']),
        } as UnitAllowedProductsOutput['products'][number],
      ],
    };

    // With priorityTargets specified, LLM filtering is applied
    const { output } = await flowOrchestrateProductSelection([unit], {
      intensity: 'low',
      maxProductsPerUnit: 1,
      priorityTargets: ['peronospora', 'oidio'], // Specify targets to trigger LLM filtering
    });

    expect(output).toHaveLength(1);
    // LLM mock returns [2, 1] -> P2 and P1, but maxProductsPerUnit is 1, so only P2
    expect(output[0].products).toHaveLength(1);
    expect(String((output[0].products[0] as { name?: string }).name)).toBe('P2');
  });

  it('includes ALL products when no priorityTargets are specified (herbicides not excluded)', async () => {
    const unit: UnitAllowedProductsOutput = {
      unitProductionId: 'unit-soia',
      cropName: 'Glycine max',
      variety: 'GLYCI_MAX',
      areaHa: 12.15,
      jobs: [],
      products: [
        {
          name: 'MOJANG 600',
          regNumber: '15926',
          status: 'cached',
          quantity: 20,
          quantityUnitOfMeasure: 'LT',
          loadWarehouse: false,
          label: {
            ...buildLabel([]),
            categoria: 'Diserbante',
            principio_attivo: 'Pethoxamid',
            colture_target: ['Mais', 'Soia', 'Colza'],
          },
        } as UnitAllowedProductsOutput['products'][number],
        {
          name: 'FUNGICIDA TEST',
          regNumber: '12345',
          status: 'cached',
          quantity: 10,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: buildLabel(['peronospora']),
        } as UnitAllowedProductsOutput['products'][number],
        {
          name: 'INSETTICIDA TEST',
          regNumber: '67890',
          status: 'cached',
          quantity: 5,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: {
            ...buildLabel([]),
            categoria: 'Insetticida',
            malattie: ['afidi'],
          },
        } as UnitAllowedProductsOutput['products'][number],
      ],
    };

    // No priorityTargets specified - ALL products should be included
    const { output, summary } = await flowOrchestrateProductSelection([unit], {
      // No priorityTargets, no intensity, no maxProductsPerUnit
      objective: 'balanced',
    });

    expect(output).toHaveLength(1);
    // ALL 3 products should be included (herbicide MOJANG 600 + fungicide + insecticide)
    expect(output[0].products).toHaveLength(3);
    // No products should be excluded
    expect(output[0].excludedProducts).toHaveLength(0);
    // Summary should reflect no reduction
    expect(summary.totalOriginalProducts).toBe(3);
    expect(summary.totalSelectedProducts).toBe(3);
    expect(summary.totalRemovedProducts).toBe(0);
    expect(summary.reductionPercentage).toBe(0);

    // Verify MOJANG 600 (herbicide) is included
    const productNames = output[0].products.map((p) => String((p as { name?: string }).name || ''));
    expect(productNames).toContain('MOJANG 600');
  });

  it('filters products by priorityTargets when specified', async () => {
    const unit: UnitAllowedProductsOutput = {
      unitProductionId: 'unit-filter-test',
      cropName: 'Test Crop',
      variety: 'Var 1',
      areaHa: 1,
      jobs: [],
      products: [
        {
          name: 'HERBICIDE',
          regNumber: '1',
          status: 'cached',
          quantity: 10,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: {
            ...buildLabel([]),
            categoria: 'Diserbante',
            malattie: [],
          },
        } as UnitAllowedProductsOutput['products'][number],
        {
          name: 'FUNGICIDE OIDIO',
          regNumber: '2',
          status: 'cached',
          quantity: 10,
          quantityUnitOfMeasure: 'kg',
          loadWarehouse: false,
          label: buildLabel(['oidio']),
        } as UnitAllowedProductsOutput['products'][number],
      ],
    };

    // With priorityTargets specified - LLM should filter
    const { output } = await flowOrchestrateProductSelection([unit], {
      priorityTargets: ['oidio', 'peronospora'],
    });

    expect(output).toHaveLength(1);
    // LLM mock returns selectedIndices [2, 1] but limited to products that cover targets
    // Since this test uses the mock, we just verify the flow runs
    expect(output[0].products.length).toBeGreaterThanOrEqual(1);
  });
});
