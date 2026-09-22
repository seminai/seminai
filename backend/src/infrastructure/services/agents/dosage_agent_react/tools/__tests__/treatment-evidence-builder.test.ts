import { buildMarkdownTable } from '../plan-builder';
import {
  attachTreatmentEvidence,
  buildTreatmentEvidenceSummary,
} from '../treatment-evidence-builder';
import type { PlanStep } from '../../type/plan';

function buildStep(overrides: Partial<PlanStep> = {}): PlanStep {
  return {
    id: 'step-1',
    sequence: 1,
    status: 'pending',
    treatment: {
      productionUnitId: 'up-1',
      productionUnitName: 'Vigneto nord',
      cropName: 'Vite',
      areaHa: 1.5,
      productName: 'ZOLFO 80 WG',
      registrationNumber: '013581',
      activeIngredient: 'Zolfo',
      adversity: 'Oidio',
      dosePerHa: 3,
      doseUnit: 'kg/ha',
      totalQuantity: 4.5,
      totalQuantityUnit: 'kg',
      applicationDate: '2026-06-10',
      safetyInterval: 5,
    },
    compliance: { status: 'conforme', violations: [] },
    ...overrides,
  };
}

const labelCache = {
  '013581': {
    productName: 'ZOLFO 80 WG',
    registrationNumber: '013581',
    label: {
      principio_attivo: 'Zolfo',
      colture_target: ['Vite'],
      malattie: ['Oidio'],
      dosaggi_dettagliati: [
        {
          coltura: 'Vite',
          malattia: 'Oidio',
          dose_minima: 2,
          dose_massima: 4,
          dose_um: 'kg/ha',
          n_max_applicazioni: 6,
          n_max_applicazioni_um: 'per anno',
          intervallo_min_giorni: 7,
          intervallo_sicurezza_giorni: 5,
        },
      ],
      fasce_rispetto_acqua: '10 m da corpi idrici',
    },
  },
};

describe('attachTreatmentEvidence', () => {
  it('marks a treatment as da_verificare when mandatory evidence is missing', () => {
    const actualSteps = attachTreatmentEvidence([buildStep()], {});

    expect(actualSteps[0]?.compliance.status).toBe('da_verificare');
    expect(actualSteps[0]?.evidence?.label.status).toBe('missing');
    expect(actualSteps[0]?.evidence?.disciplinare.status).toBe('missing');
    expect(actualSteps[0]?.evidence?.derogations.status).toBe('not_verified');
  });

  it('keeps a treatment conform only when label, rules and derogation evidence are present', () => {
    const actualSteps = attachTreatmentEvidence([buildStep()], {
      labelCache,
      complianceResult: {
        disciplinareInfoMap: new Map([
          [
            'zolfo::vite',
            [
              {
                dosaggi: 'max 4 kg/ha',
                n_max_interventi_sa: 6,
                n_max_interventi_sa_scope: 'per anno',
                gruppo_sostanze_attive: ['multi-sito'],
                limitazioni_uso_e_note: 'Deroga regionale ammessa da bollettino n. 12.',
              },
            ],
          ],
        ]),
        appliedRulesByProduct: new Map([
          ['up-1::ZOLFO 80 WG', [{ ruleName: 'Disciplinare vite 2026', isCompliant: true }]],
        ]),
      },
    });

    expect(actualSteps[0]?.compliance.status).toBe('conforme');
    expect(actualSteps[0]?.evidence?.label.doseRange).toBe('2-4 kg/ha');
    expect(actualSteps[0]?.evidence?.disciplinare.doseLimit).toBe('max 4 kg/ha');
    expect(actualSteps[0]?.evidence?.derogations.status).toBe('found');
  });

  it('summarizes evidence and renders normative columns in the markdown table', () => {
    const actualSteps = attachTreatmentEvidence([buildStep()], { labelCache });
    const summary = buildTreatmentEvidenceSummary(actualSteps);
    const markdown = buildMarkdownTable(actualSteps, { hasIssues: false, products: [] });

    expect(summary[0]?.label).toBe('2-4 kg/ha');
    expect(summary[0]?.verdict).toBe('da_verificare');
    expect(markdown).toContain('Limite etichetta');
    expect(markdown).toContain('Limite disciplinare');
    expect(markdown).toContain('Bollettini/deroghe');
    expect(markdown).toContain('2-4 kg/ha');
  });
});
