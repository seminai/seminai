import { flowMatchDosageDisciplinari } from '../infrastructure/services/agents/dosage_agent/flowMatchDosageDisciplinari';
import { UnitAllowedProductsWithDosageOutput } from '../infrastructure/services/agents/dosage_agent/flowMatchProductionUnitTreatmentDosage';

/**
 * Test manuale per flowMatchDosageDisciplinari
 * Esegue la validazione dei dosaggi contro i disciplinari per una unità produttiva di test.
 */
async function runTest() {
  console.log('[TEST] Starting match_3 test execution...');

  // Dati di mock per l'unità produttiva e il prodotto
  // Usiamo un prodotto reale (es. un rameico comune) per aumentare le probabilità di match nel DB BDF
  const mockProduct = {
    name: 'POLTIGLIA DISPERSS',
    regNumber: '13388',
    status: 'extracted' as const, // Aggiunto status richiesto dal tipo
    trattamenti: [
      {
        data_distribuzione: new Date('2024-05-15'),
        epoca_impiego: 'Accrescimento germogli',
        dose: 50.0, // Dose volutamente alta per forzare una riduzione (limite tipico ~4-6 kg/ha)
        dosaggio_um: 'kg/ha',
        note: 'Test note initial',
        isLocalizedTreatment: false,
      },
    ],
  };

  const mockUnit: UnitAllowedProductsWithDosageOutput = {
    unitProductionId: 'test-unit-001',
    cropName: 'Vite per uva da vino',
    variety: 'Sangiovese',
    areaHa: 2.5,
    jobs: [],
    products: [mockProduct],
  };

  // Mock per l'unità normalizzata (informazioni geografiche)
  const mockNormalizedUnit = {
    id: 'test-unit-001',
    region: 'Emilia-Romagna',
    city: 'Bologna',
    address: 'Via dei Colli',
    nation: 'Italia',
    cropVariety: 'Sangiovese',
    disciplinari: [],
  };

  console.log('[TEST] Input Unit:', JSON.stringify(mockUnit, null, 2));
  console.log('[TEST] Normalized Unit:', JSON.stringify(mockNormalizedUnit, null, 2));

  try {
    console.log('[TEST] Invoking flowMatchDosageDisciplinari...');

    const result = await flowMatchDosageDisciplinari({
      units: [mockUnit],
      normalizedUnits: [mockNormalizedUnit],
      // historyManager non passato (opzionale)
    });

    console.log('[TEST] Execution completed successfully.');
    console.log('[TEST] Result:', JSON.stringify(result, null, 2));

    // Verifica dei risultati
    const resultProduct = result[0].products![0];
    const originalDose = mockProduct.trattamenti[0].dose;
    const resultTreatment = resultProduct.trattamenti![0];
    const resultDose = resultTreatment.dose;

    console.log('\n[TEST] --- Verification ---');
    console.log(`[TEST] Original Dose: ${originalDose} ${mockProduct.trattamenti[0].dosaggio_um}`);
    console.log(`[TEST] Result Dose:   ${resultDose} ${resultTreatment.dosaggio_um}`);
    console.log(`[TEST] Notes:         ${resultTreatment.note}`);

    if (resultDose !== undefined && resultDose < originalDose) {
      console.log('[TEST] ✅ SUCCESS: Dose was reduced, disciplinare limit applied.');
    } else if (resultDose === originalDose) {
      console.log(
        '[TEST] ⚠️ INFO: Dose was NOT reduced. Either no limit found or dose was within limits.',
      );
    } else {
      console.log('[TEST] ❌ UNEXPECTED: Result dose is higher or undefined?');
    }
  } catch (error) {
    console.error('[TEST] ❌ Test failed with error:', error);
    if (error instanceof Error) {
      console.error(error.stack);
    }
  } finally {
    // Necessario se lo script tiene aperte connessioni DB (prisma)
    process.exit(0);
  }
}

// Esegui il test
runTest();
