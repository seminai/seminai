import { flowOptimizeDosageLinearFunc } from '../infrastructure/services/agents/dosage_agent/flowOptimizeDosageLineareFunc';
import type { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import type { Label } from '../domain/dtos/label.dto';

function buildLabelWithDoseRange(params: {
  readonly doseMin: number;
  readonly doseMax: number;
  readonly doseUm: string;
}): Label {
  return {
    prodotto: 'X',
    categoria: 'Fungicida',
    formulazione: null,
    principio_attivo: 'AI',
    composizione: 'Comp',
    meccanismo_azione_frac: null,
    malattie: ['oidio'],
    specie: [],
    colture_target: ['Test Crop'],
    dosaggi_dettagliati: [
      {
        coltura: 'Test Crop',
        dose_minima: params.doseMin,
        dose_massima: params.doseMax,
        dose_um: params.doseUm,
        acqua_max: null,
        acqua_max_um: null,
        n_max_applicazioni: 1,
        n_max_applicazioni_um: 'per ciclo',
        intervallo_min_giorni: null,
        intervallo_sicurezza_giorni: null,
        epoca_impiego: 'pre',
        modalita_applicazione: null,
        istruzioni: null,
      },
    ],
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
    extracted_fields: ['dosaggi_dettagliati', 'colture_target'],
    errors: [],
    numero_registrazione: '1',
    titolare: null,
    stabilimento: null,
    caratteristiche: null,
  };
}

function buildUnit(params: {
  readonly unitId: string;
  readonly areaHa: number;
  readonly productName: string;
  readonly regNumber: string;
  readonly quantity: number;
  readonly quantityUnitOfMeasure: string;
  readonly doseMin: number;
  readonly doseMax: number;
  readonly existingDose: number;
  readonly strategy?: 'min' | 'max' | 'avg' | 'current';
  readonly treatedAreaHa?: number;
  readonly isLocalizedTreatment?: boolean;
}): UnitAllowedProductsWithDosageOutput {
  return {
    unitProductionId: params.unitId,
    cropName: 'Test Crop',
    variety: 'Var 1',
    areaHa: params.areaHa,
    jobs: [],
    products: [
      {
        name: params.productName,
        regNumber: params.regNumber,
        status: 'cached',
        quantity: params.quantity,
        quantityUnitOfMeasure: params.quantityUnitOfMeasure,
        strategy: params.strategy,
        loadWarehouse: false,
        treatedAreaHa: params.treatedAreaHa,
        isLocalizedTreatment: params.isLocalizedTreatment,
        label: buildLabelWithDoseRange({
          doseMin: params.doseMin,
          doseMax: params.doseMax,
          doseUm: `${params.quantityUnitOfMeasure}/ha`,
        }),
        trattamenti: [
          {
            epoca_impiego: 'pre',
            dose: params.existingDose,
            note: 'base',
          },
        ],
      } as UnitAllowedProductsWithDosageOutput['products'][number],
    ],
  };
}

describe('flowOptimizeDosageLinearFunc - current strategy full distribution', () => {
  it('reduces treated area when stock is lower than minimum feasible dose plan', async () => {
    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      buildUnit({
        unitId: 'unit-shortage',
        areaHa: 10,
        productName: 'P1',
        regNumber: '11',
        quantity: 5,
        quantityUnitOfMeasure: 'kg',
        doseMin: 1,
        doseMax: 3,
        existingDose: 1,
      }),
    ];
    const optimized = await flowOptimizeDosageLinearFunc(units, 'current', undefined, false);
    const optimizedProduct = optimized[0].products[0];
    const optimizedDose = optimizedProduct.trattamenti?.[0]?.dose;
    expect(optimizedDose).toBe(1);
    expect(optimizedProduct.treatedAreaHa).toBeCloseTo(5, 2);
    const optimizedNote = String(optimizedProduct.trattamenti?.[0]?.note || '');
    expect(optimizedNote).toContain('Area trattata ridotta');
  });

  it('expands treated area to saturate stock when there is residual stock and compatible capacity', async () => {
    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      buildUnit({
        unitId: 'unit-expand',
        areaHa: 10,
        productName: 'P2',
        regNumber: '22',
        quantity: 8,
        quantityUnitOfMeasure: 'kg',
        doseMin: 1,
        doseMax: 1,
        existingDose: 1,
        treatedAreaHa: 4,
        isLocalizedTreatment: true,
      }),
    ];
    const optimized = await flowOptimizeDosageLinearFunc(units, 'current', undefined, false);
    const optimizedProduct = optimized[0].products[0];
    expect(optimizedProduct.treatedAreaHa).toBeCloseTo(8, 2);
    const optimizedNote = String(optimizedProduct.trattamenti?.[0]?.note || '');
    expect(optimizedNote).toContain('Area trattata estesa');
  });

  it('keeps residual warning when stock cannot be fully allocated within label and area limits', async () => {
    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      buildUnit({
        unitId: 'unit-residual',
        areaHa: 4,
        productName: 'P3',
        regNumber: '33',
        quantity: 10,
        quantityUnitOfMeasure: 'kg',
        doseMin: 1,
        doseMax: 1,
        existingDose: 1,
      }),
    ];
    const optimized = await flowOptimizeDosageLinearFunc(units, 'current', undefined, false);
    const optimizedNote = String(optimized[0].products[0].trattamenti?.[0]?.note || '');
    expect(optimizedNote).toContain('Residuo non allocabile');
  });

  it('optimizes multiple products independently in current strategy', async () => {
    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      {
        unitProductionId: 'unit-multi',
        cropName: 'Test Crop',
        variety: 'Var 1',
        areaHa: 10,
        jobs: [],
        products: [
          {
            name: 'P4',
            regNumber: '44',
            status: 'cached',
            quantity: 5,
            quantityUnitOfMeasure: 'kg',
            loadWarehouse: false,
            label: buildLabelWithDoseRange({ doseMin: 1, doseMax: 3, doseUm: 'kg/ha' }),
            trattamenti: [{ epoca_impiego: 'pre', dose: 1, note: 'base-a' }],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
          {
            name: 'P5',
            regNumber: '55',
            status: 'cached',
            quantity: 20,
            quantityUnitOfMeasure: 'kg',
            loadWarehouse: false,
            treatedAreaHa: 5,
            label: buildLabelWithDoseRange({ doseMin: 1, doseMax: 2, doseUm: 'kg/ha' }),
            trattamenti: [{ epoca_impiego: 'pre', dose: 1, note: 'base-b' }],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      },
    ];
    const optimized = await flowOptimizeDosageLinearFunc(units, 'current', undefined, false);
    const p4 = optimized[0].products.find((p) => (p as { regNumber?: string }).regNumber === '44');
    const p5 = optimized[0].products.find((p) => (p as { regNumber?: string }).regNumber === '55');
    expect(p4?.treatedAreaHa).toBeCloseTo(5, 2);
    expect(p5?.treatedAreaHa).toBeCloseTo(10, 2);
  });

  it('uses per-product strategy override instead of global strategy', async () => {
    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      {
        unitProductionId: 'unit-per-product-strategy',
        cropName: 'Test Crop',
        variety: 'Var 1',
        areaHa: 1,
        jobs: [],
        products: [
          {
            name: 'P6',
            regNumber: '66',
            status: 'cached',
            quantity: 50,
            quantityUnitOfMeasure: 'kg',
            strategy: 'min',
            loadWarehouse: false,
            label: buildLabelWithDoseRange({ doseMin: 1, doseMax: 3, doseUm: 'kg/ha' }),
            trattamenti: [{ epoca_impiego: 'pre', dose: 2, note: 'base-min' }],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
          {
            name: 'P7',
            regNumber: '77',
            status: 'cached',
            quantity: 50,
            quantityUnitOfMeasure: 'kg',
            strategy: 'max',
            loadWarehouse: false,
            label: buildLabelWithDoseRange({ doseMin: 1, doseMax: 3, doseUm: 'kg/ha' }),
            trattamenti: [{ epoca_impiego: 'pre', dose: 2, note: 'base-max' }],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      },
    ];
    const optimized = await flowOptimizeDosageLinearFunc(units, 'avg', undefined, false);
    const minProduct = optimized[0].products.find(
      (p) => (p as { regNumber?: string }).regNumber === '66',
    );
    const maxProduct = optimized[0].products.find(
      (p) => (p as { regNumber?: string }).regNumber === '77',
    );
    expect(minProduct?.trattamenti?.[0]?.dose).toBeCloseTo(1, 4);
    expect(maxProduct?.trattamenti?.[0]?.dose).toBeCloseTo(3, 4);
  });
});
