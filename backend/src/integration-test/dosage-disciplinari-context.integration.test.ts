import { flowMatchDosageDisciplinari } from '../infrastructure/services/agents/dosage_agent/flowMatchDosageDisciplinari';
import type { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { JobHistoryManager } from '../infrastructure/services/agents/dosage_agent/historyCollector';

describe('dosage disciplinari context integration', () => {
  it('includes diseases, notes and priority targets in disciplinari search context', async () => {
    const unitProductionId = `unit-${Date.now()}`;
    const inputUnits: ReadonlyArray<UnitAllowedProductsWithDosageOutput> = [
      {
        unitProductionId,
        cropName: 'Melo',
        variety: 'Golden',
        areaHa: 1,
        jobs: [],
        products: [
          {
            name: 'REVYSION',
            regNumber: '18137',
            status: 'cached',
            quantity: 5,
            quantityUnitOfMeasure: 'L',
            label: {
              dosaggi_dettagliati: [{ malattia: 'Oidio o Mal bianco' }],
            },
            trattamenti: [
              {
                data_distribuzione: new Date('2025-04-01T00:00:00.000Z'),
                dose: 5,
                dosaggio_um: 'l/ha',
                epoca_impiego: 'pre-raccolta',
                note: null,
              },
            ],
          } as unknown as UnitAllowedProductsWithDosageOutput['products'][number],
        ],
      } as unknown as UnitAllowedProductsWithDosageOutput,
    ];
    const normalizedUnits = [
      {
        id: unitProductionId,
        region: 'Emilia Romagna',
      },
    ];
    const historyManager = new JobHistoryManager();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const result = await flowMatchDosageDisciplinari({
      units: inputUnits,
      normalizedUnits,
      historyManager,
      disciplinariContext: {
        agronomicNotes: 'Avoid copper in flowering',
        priorityTargets: ['Oidio', 'Ticchiolatura'],
      },
    });
    const firstUnit = result[0];
    const firstProduct = firstUnit.products[0];
    const firstTreatment = firstProduct.trattamenti?.[0];
    expect(firstTreatment?.dose).toBeLessThanOrEqual(2);
    const noteValue = String(firstTreatment?.note ?? '');
    expect(noteValue).toContain('[DISCIPLINARE] Dose ridotta');
    const logMessages = logSpy.mock.calls.map((call) =>
      call.map((value) => String(value)).join(' '),
    );
    const contextLog = logMessages.find((message) => message.includes('Contesto ricerca'));
    expect(contextLog).toBeDefined();
    expect(contextLog).toContain('Diseases: Oidio o Mal bianco');
    expect(contextLog).toContain('Priority targets: Oidio, Ticchiolatura');
    expect(contextLog).toContain('Agronomic notes: Avoid copper in flowering');
    logSpy.mockRestore();
  });
});
