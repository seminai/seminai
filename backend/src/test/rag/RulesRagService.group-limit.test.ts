/**
 * Unit test for checkGroupLimitViolation() in RulesRagService.
 * Tests regex extraction of group limits from disciplinare text
 * for multiple products/SA groups.
 *
 * No external services required (no Qdrant, no DB, no Redis).
 */

import { RulesRagService } from '../../infrastructure/services/rag/RulesRagService';
import type { RuleComplianceResult } from '../../domain/dtos/rule-rag.types';

// Access private methods for testing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceAny = any;

// ============================================================================
// REAL TEXT SAMPLES from Emilia-Romagna 2025 disciplinare
// ============================================================================

const DISCIPLINARE_SAMPLES = {
  folpetGroup: `
    Antiperonosporici ammessi su Vite da uva da vino.
    Complessivamente sono ammessi al massimo 12 interventi tra Ditianon, Fluazinam e Folpet
    indipendentemente dall'avversità per cui vengono utilizzati.
    Folpet: ammesso per Escoriosi, Peronospora, Black-rot, Botrite.
  `,

  sdhiGroup: `
    Fungicidi SDHI ammessi su Vite da uva da vino.
    Al massimo 4 interventi tra Boscalid, Fluopyram, Fluxapyroxad e Penthiopyrad
    indipendentemente dall'avversità. SDHI: Oidio, Botrite.
  `,

  ibeGroup: `
    IBE (Inibitori della biosintesi dell'ergosterolo) ammessi su Vite da uva da vino.
    Sono consentiti al massimo 3 interventi tra Difenoconazolo, Mefentrifluconazolo e Tebuconazolo
    per anno. Utilizzabili per Oidio, Black-rot.
  `,

  capGroup: `
    CAA (Carbossilic Acid Amide) ammessi su Vite da uva da vino.
    Massimo 4 interventi tra Bentiavalicarb, Dimetomorf, Iprovalicarb, Mandipropamid e Valifenalate
    per anno colturale. Utilizzabili per Peronospora.
  `,

  maxTreatmentFormat: `
    Rame: massimo 6 trattamenti/anno su Vite da uva da vino.
    Non superare i 28 kg/ha di rame metallo per ciclo colturale.
  `,

  tableFormat: `
    Tabella anticrittogamici Vite
    | Sostanza attiva | N° max interventi | Note |
    | Folpet          | 12                | Vincolo con Ditianon e Fluazinam |
    | Boscalid        | 4                 | Gruppo SDHI |
  `,

  indipendentementeFormat: `
    Indipendentemente dall'avversità max 8 interventi con prodotti a base di Rame
    su colture frutticole e orticole.
  `,

  noGroupLimit: `
    Zolfo: ammesso senza limitazioni sul numero di interventi per Oidio su Vite.
    Utilizzare preferibilmente in forma bagnabile alle dosi consigliate.
  `,
};

// ============================================================================
// TEST PRODUCTS
// ============================================================================

interface TestCase {
  name: string;
  activeIngredient: string;
  text: string;
  maxApplications: number;
  shouldViolate: boolean;
  expectedLimit?: number;
  expectedGroup?: string[];
}

const TEST_CASES: TestCase[] = [
  // --- FOLPET GROUP (12 interventi tra Ditianon, Fluazinam, Folpet) ---
  {
    name: 'Folpet exceeds group limit (15 > 12)',
    activeIngredient: 'Folpet',
    text: DISCIPLINARE_SAMPLES.folpetGroup,
    maxApplications: 15,
    shouldViolate: true,
    expectedLimit: 12,
    expectedGroup: ['ditianon', 'fluazinam', 'folpet'],
  },
  {
    name: 'Folpet within limit (10 <= 12)',
    activeIngredient: 'Folpet',
    text: DISCIPLINARE_SAMPLES.folpetGroup,
    maxApplications: 10,
    shouldViolate: false,
  },
  {
    name: 'Ditianon exceeds same group limit (13 > 12)',
    activeIngredient: 'Ditianon',
    text: DISCIPLINARE_SAMPLES.folpetGroup,
    maxApplications: 13,
    shouldViolate: true,
    expectedLimit: 12,
  },
  {
    name: 'Fluazinam within same group limit (12 = 12)',
    activeIngredient: 'Fluazinam',
    text: DISCIPLINARE_SAMPLES.folpetGroup,
    maxApplications: 12,
    shouldViolate: false,
  },

  // --- SDHI GROUP (4 interventi tra Boscalid, Fluopyram, Fluxapyroxad, Penthiopyrad) ---
  {
    name: 'Fluxapyroxad exceeds SDHI group limit (6 > 4)',
    activeIngredient: 'Fluxapyroxad',
    text: DISCIPLINARE_SAMPLES.sdhiGroup,
    maxApplications: 6,
    shouldViolate: true,
    expectedLimit: 4,
  },
  {
    name: 'Boscalid within SDHI group limit (3 <= 4)',
    activeIngredient: 'Boscalid',
    text: DISCIPLINARE_SAMPLES.sdhiGroup,
    maxApplications: 3,
    shouldViolate: false,
  },
  {
    name: 'Penthiopyrad exceeds SDHI group limit (5 > 4)',
    activeIngredient: 'Penthiopyrad',
    text: DISCIPLINARE_SAMPLES.sdhiGroup,
    maxApplications: 5,
    shouldViolate: true,
    expectedLimit: 4,
  },

  // --- IBE GROUP (3 interventi tra Difenoconazolo, Mefentrifluconazolo, Tebuconazolo) ---
  {
    name: 'Mefentrifluconazolo exceeds IBE group limit (5 > 3)',
    activeIngredient: 'Mefentrifluconazolo',
    text: DISCIPLINARE_SAMPLES.ibeGroup,
    maxApplications: 5,
    shouldViolate: true,
    expectedLimit: 3,
  },
  {
    name: 'Tebuconazolo within IBE group limit (2 <= 3)',
    activeIngredient: 'Tebuconazolo',
    text: DISCIPLINARE_SAMPLES.ibeGroup,
    maxApplications: 2,
    shouldViolate: false,
  },

  // --- CAA GROUP (4 interventi tra Bentiavalicarb, Dimetomorf, Iprovalicarb, etc.) ---
  {
    name: 'Dimetomorf exceeds CAA group limit (7 > 4)',
    activeIngredient: 'Dimetomorf',
    text: DISCIPLINARE_SAMPLES.capGroup,
    maxApplications: 7,
    shouldViolate: true,
    expectedLimit: 4,
  },
  {
    name: 'Mandipropamid within CAA group limit (4 = 4)',
    activeIngredient: 'Mandipropamid',
    text: DISCIPLINARE_SAMPLES.capGroup,
    maxApplications: 4,
    shouldViolate: false,
  },

  // --- GENERIC "massimo X trattamenti" pattern ---
  {
    name: 'Rame exceeds generic limit (8 > 6)',
    activeIngredient: 'Rame',
    text: DISCIPLINARE_SAMPLES.maxTreatmentFormat,
    maxApplications: 8,
    shouldViolate: true,
    expectedLimit: 6,
  },

  // --- "Indipendentemente" pattern ---
  {
    name: 'Rame exceeds "indipendentemente" limit (10 > 8)',
    activeIngredient: 'Rame',
    text: DISCIPLINARE_SAMPLES.indipendentementeFormat,
    maxApplications: 10,
    shouldViolate: true,
    expectedLimit: 8,
  },

  // --- NO GROUP LIMIT ---
  {
    name: 'Zolfo has no group limit - no violation',
    activeIngredient: 'Zolfo',
    text: DISCIPLINARE_SAMPLES.noGroupLimit,
    maxApplications: 20,
    shouldViolate: false,
  },

  // --- UNRELATED INGREDIENT ---
  {
    name: 'Azoxystrobin not in Folpet group - no violation',
    activeIngredient: 'Azoxystrobin',
    text: DISCIPLINARE_SAMPLES.folpetGroup,
    maxApplications: 50,
    shouldViolate: false,
  },
];

// ============================================================================
// TEST SUITE
// ============================================================================

describe('RulesRagService - Group Limit Validation', () => {
  let service: ServiceAny;

  const mockResult: RuleComplianceResult = {
    ruleId: 'test-rule-id',
    ruleName: 'Disciplinare Emilia-Romagna 2025',
    category: 'DISCIPLINARE',
    score: 0.85,
    relevantChunks: [{ content: 'test chunk', chunkIndex: 0, score: 0.85 }],
    isCompliant: true,
    violations: [],
  };

  beforeAll(() => {
    service = new RulesRagService();
  });

  // ============================================================================
  // extractGroupLimitsFromText tests
  // ============================================================================

  describe('extractGroupLimitsFromText', () => {
    it('should extract "X interventi tra" pattern', () => {
      const limits = service.extractGroupLimitsFromText(
        DISCIPLINARE_SAMPLES.folpetGroup.toLowerCase(),
      );
      expect(limits.length).toBeGreaterThanOrEqual(1);

      const folpetLimit = limits.find(
        (l: { substances: string[] }) =>
          l.substances.some((s: string) => s.includes('folpet')) &&
          l.substances.some((s: string) => s.includes('ditianon')),
      );
      expect(folpetLimit).toBeDefined();
      expect(folpetLimit.maxInterventions).toBe(12);
      expect(folpetLimit.substances).toContain('folpet');
      expect(folpetLimit.substances).toContain('ditianon');
      expect(folpetLimit.substances).toContain('fluazinam');
    });

    it('should extract SDHI group limit', () => {
      const limits = service.extractGroupLimitsFromText(
        DISCIPLINARE_SAMPLES.sdhiGroup.toLowerCase(),
      );
      const sdhiLimit = limits.find((l: { substances: string[] }) =>
        l.substances.some((s: string) => s.includes('boscalid')),
      );
      expect(sdhiLimit).toBeDefined();
      expect(sdhiLimit.maxInterventions).toBe(4);
      expect(sdhiLimit.substances.length).toBeGreaterThanOrEqual(3);
    });

    it('should extract "massimo X trattamenti" pattern', () => {
      const limits = service.extractGroupLimitsFromText(
        DISCIPLINARE_SAMPLES.maxTreatmentFormat.toLowerCase(),
      );
      const genericLimit = limits.find(
        (l: { maxInterventions: number }) => l.maxInterventions === 6,
      );
      expect(genericLimit).toBeDefined();
    });

    it('should extract "indipendentemente" pattern', () => {
      const limits = service.extractGroupLimitsFromText(
        DISCIPLINARE_SAMPLES.indipendentementeFormat.toLowerCase(),
      );
      const indipLimit = limits.find((l: { maxInterventions: number }) => l.maxInterventions === 8);
      expect(indipLimit).toBeDefined();
    });

    it('should return empty for text without group limits', () => {
      const limits = service.extractGroupLimitsFromText(
        DISCIPLINARE_SAMPLES.noGroupLimit.toLowerCase(),
      );
      // May find generic "max" patterns but should not find specific group limits
      const specificGroupLimits = limits.filter(
        (l: { substances: string[] }) => l.substances.length >= 2,
      );
      expect(specificGroupLimits.length).toBe(0);
    });
  });

  // ============================================================================
  // checkGroupLimitViolation - all products
  // ============================================================================

  describe('checkGroupLimitViolation', () => {
    for (const tc of TEST_CASES) {
      it(tc.name, () => {
        const violation = service.checkGroupLimitViolation(
          tc.text.toLowerCase(),
          tc.activeIngredient,
          tc.maxApplications,
          mockResult,
          'DISCIPLINARE',
        );

        if (tc.shouldViolate) {
          expect(violation).not.toBeNull();
          expect(violation.violationType).toBe('MAX_APPLICATIONS_EXCEEDED');
          expect(violation.severity).toBe('CRITICAL');
          if (tc.expectedLimit) {
            expect(violation.description).toContain(String(tc.expectedLimit));
          }
          console.log(`  ✓ VIOLATION: ${violation.description}`);
        } else {
          expect(violation).toBeNull();
          console.log(
            `  ✓ COMPLIANT: ${tc.activeIngredient} with ${tc.maxApplications} applications`,
          );
        }
      });
    }
  });

  // ============================================================================
  // SUMMARY TABLE
  // ============================================================================

  afterAll(() => {
    console.log('\n============================================================');
    console.log('MULTI-PRODUCT GROUP LIMIT VALIDATION SUMMARY');
    console.log('============================================================');
    console.log(`Total test cases: ${TEST_CASES.length}`);
    console.log(`Products tested: Folpet, Ditianon, Fluazinam, Fluxapyroxad, Boscalid,`);
    console.log(`  Penthiopyrad, Mefentrifluconazolo, Tebuconazolo, Dimetomorf,`);
    console.log(`  Mandipropamid, Rame, Zolfo, Azoxystrobin`);
    console.log('Groups tested:');
    console.log('  - Ditianon/Fluazinam/Folpet (max 12)');
    console.log('  - SDHI: Boscalid/Fluopyram/Fluxapyroxad/Penthiopyrad (max 4)');
    console.log('  - IBE: Difenoconazolo/Mefentrifluconazolo/Tebuconazolo (max 3)');
    console.log(
      '  - CAA: Bentiavalicarb/Dimetomorf/Iprovalicarb/Mandipropamid/Valifenalate (max 4)',
    );
    console.log('  - Rame (max 6 trattamenti/anno)');
    console.log('============================================================\n');
  });
});
