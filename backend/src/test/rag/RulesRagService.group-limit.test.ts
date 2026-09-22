/**
 * Unit test for checkGroupLimitViolation() in RulesRagService.
 * Tests regex extraction of group limits from disciplinare text
 * for multiple products/SA groups.
 *
 * No external services required (no Qdrant, no DB, no Redis).
 */

/**
 * Unit test for checkGroupLimitViolation() in RulesRagService.
 * Tests regex extraction of group limits from disciplinare text
 * for multiple products/SA groups.
 *
 * No external services required (no Qdrant, no DB, no Redis).
 */
import { RulesRagService } from '../../infrastructure/services/rag/RulesRagService';
import type { RuleComplianceResult } from '../../domain/dtos/rule-rag.types';
import { RulesRagServiceUnderTest, DISCIPLINARE_SAMPLES, TEST_CASES } from './RulesRagService.group-limit.harness';

// ============================================================================
// TEST SUITE
// ============================================================================

describe('RulesRagService - Group Limit Validation', () => {
  let service: RulesRagServiceUnderTest;

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
    service = new RulesRagService() as unknown as RulesRagServiceUnderTest;
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
      if (!folpetLimit) throw new Error('Expected a Folpet group limit');
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
      if (!sdhiLimit) throw new Error('Expected an SDHI group limit');
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
          if (!violation) throw new Error(`Expected violation for ${tc.name}`);
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
