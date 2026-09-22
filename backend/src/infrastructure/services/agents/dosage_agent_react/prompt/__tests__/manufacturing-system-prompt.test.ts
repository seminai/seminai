import { buildSystemPrompt, type SystemPromptOptions } from '../system-prompt';

const FIXED_NOW = new Date('2026-06-29T00:00:00.000Z');

const baseFlags: SystemPromptOptions = {
  hasRulesSearch: false,
  hasJobOperationsSearch: false,
  hasDisciplinariPdf: false,
  hasBdfTools: false,
  hasTavilySearch: false,
  hasJobModification: false,
  hasContextDiscovery: true,
  hasPlanning: false,
  hasFieldNoteDelegation: false,
  hasProductLabelDb: false,
  hasEntityCreation: false,
  hasConformityCheck: false,
  hasJobManagement: false,
  hasProductRecommendation: false,
  hasPhotoDiagnosis: false,
};

describe('buildSystemPrompt — MANUFACTURING domain', () => {
  const prompt = buildSystemPrompt({ ...baseFlags, domain: 'MANUFACTURING' }, FIXED_NOW);

  it('uses the manufacturing persona and language rule', () => {
    expect(prompt).toContain('azienda manifatturiera');
    expect(prompt).toContain('REGOLA #1 — LINGUA DI RISPOSTA');
  });

  it('documents only manufacturing tools', () => {
    expect(prompt).toContain('import_stock_from_file');
    expect(prompt).toContain('present_extraction_review');
    expect(prompt).toContain('search_company_stock_products');
  });

  it('leaks no agronomic tool guidance or dosage workflow', () => {
    // The persona may *name* agronomy to decline it; what must never leak is the
    // agronomic tool guidance / dosage workflow itself.
    for (const marker of [
      'calculate_dosage',
      'search_product_label_database',
      'generate_treatment_plan',
      'delegate_to_field_note',
      'validate_compliance',
      'WORKFLOW RACCOMANDATO per pianificare trattamenti',
      'STRUMENTI COMPUTAZIONALI',
    ]) {
      expect(prompt).not.toContain(marker);
    }
  });
});

describe('buildSystemPrompt — DOSAGE domain (zero-regression)', () => {
  it('is byte-identical whether domain is omitted or explicitly DOSAGE', () => {
    const omitted = buildSystemPrompt({ ...baseFlags }, FIXED_NOW);
    const explicit = buildSystemPrompt({ ...baseFlags, domain: 'DOSAGE' }, FIXED_NOW);
    expect(explicit).toBe(omitted);
  });

  it('keeps the agronomic persona for the default domain', () => {
    const dosage = buildSystemPrompt({ ...baseFlags }, FIXED_NOW);
    expect(dosage).toContain('agronomo esperto di fitofarmaci');
    expect(dosage).not.toContain('azienda manifatturiera');
  });
});
