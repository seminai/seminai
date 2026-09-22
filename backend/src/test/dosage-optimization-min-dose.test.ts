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

describe('flowOptimizeDosageLinearFunc - min dose bound', () => {
  it('does not scale below label minimum dose when outStockLimiter=true and stock is below minimum required', async () => {
    const units: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      {
        unitProductionId: 'unit-1',
        cropName: 'Test Crop',
        variety: 'Var 1',
        areaHa: 10,
        jobs: [],
        products: [
          {
            name: 'P1',
            regNumber: '1',
            status: 'cached',
            quantity: 10, // kg available
            quantityUnitOfMeasure: 'kg',
            loadWarehouse: false,
            label: buildLabelWithDoseRange({ doseMin: 2, doseMax: 4, doseUm: 'kg/ha' }),
            trattamenti: [
              {
                epoca_impiego: 'pre',
                note: 'x',
              },
            ],
          } as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      },
    ];

    const optimized = await flowOptimizeDosageLinearFunc(units, 'min', undefined, true);

    const dose = optimized[0].products[0].trattamenti?.[0]?.dose;
    expect(dose).toBe(2);
    const note = String(optimized[0].products[0].trattamenti?.[0]?.note || '');
    expect(note).not.toContain('DOSE SOTTO MINIMO ETICHETTA');
    expect(note).toContain('Stock insufficiente');
  });
});
