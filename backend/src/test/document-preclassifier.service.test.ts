import {
  DocumentPreclassifierService,
  type RawPreclassifierOutput,
} from '../infrastructure/services/extraction/document-preclassifier.service';
import {
  type CompanyMatchSource,
  type PreclassificationCompany,
} from '../domain/dtos/preclassification.dto';

const companies: PreclassificationCompany[] = [
  { id: 'a', name: 'Alfa', vatNumber: '01234567890', fiscalCode: 'AAA', cuaa: null, city: null },
  { id: 'b', name: 'Beta', vatNumber: '09876543210', fiscalCode: 'BBB', cuaa: null, city: null },
];

function baseInput(
  overrides: Partial<Parameters<DocumentPreclassifierService['preclassify']>[0]> = {},
) {
  return {
    fileName: 'doc.pdf',
    mimeType: 'application/pdf',
    text: 'contenuto del documento sufficientemente lungo',
    companies,
    deterministicCompanyId: null,
    deterministicSource: 'none' as CompanyMatchSource,
    vatHint: null,
    ...overrides,
  };
}

function llm(output: Partial<RawPreclassifierOutput>) {
  return async (): Promise<RawPreclassifierOutput> => ({
    documentCategory: null,
    categoryConfidence: 0,
    companyId: null,
    companyConfidence: 0,
    reason: 'r',
    ...output,
  });
}

describe('DocumentPreclassifierService', () => {
  it('returns a valid enum category above threshold', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ documentCategory: 'FATTURA', categoryConfidence: 0.9 }),
    });
    const actual = await service.preclassify(baseInput());
    expect(actual.documentCategory).toBe('FATTURA');
  });

  it('gates a low-confidence category to null', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ documentCategory: 'FATTURA', categoryConfidence: 0.3 }),
    });
    const actual = await service.preclassify(baseInput());
    expect(actual.documentCategory).toBeNull();
    expect(actual.categoryConfidence).toBeCloseTo(0.3);
  });

  it('rejects an invalid enum value', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ documentCategory: 'BANANA', categoryConfidence: 0.95 }),
    });
    const actual = await service.preclassify(baseInput());
    expect(actual.documentCategory).toBeNull();
  });

  it('accepts a valid companyId from the list above threshold', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ companyId: 'a', companyConfidence: 0.9 }),
    });
    const actual = await service.preclassify(baseInput());
    expect(actual.companyId).toBe('a');
    expect(actual.companyMatchSource).toBe('llm');
  });

  it('rejects a companyId not present in the provided list', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ companyId: 'zzz', companyConfidence: 0.99 }),
    });
    const actual = await service.preclassify(baseInput());
    expect(actual.companyId).toBeNull();
    expect(actual.companyMatchSource).toBe('none');
  });

  it('gates a low-confidence company match to null', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ companyId: 'a', companyConfidence: 0.4 }),
    });
    const actual = await service.preclassify(baseInput());
    expect(actual.companyId).toBeNull();
  });

  it('lets the deterministic match override the LLM company field', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ companyId: 'a', companyConfidence: 0.99 }),
    });
    const actual = await service.preclassify(
      baseInput({ deterministicCompanyId: 'b', deterministicSource: 'vat_exact' }),
    );
    expect(actual.companyId).toBe('b');
    expect(actual.companyConfidence).toBe(1);
    expect(actual.companyMatchSource).toBe('vat_exact');
  });

  it('degrades gracefully when the LLM throws, keeping the deterministic company', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: async () => {
        throw new Error('llm down');
      },
    });
    const actual = await service.preclassify(
      baseInput({ deterministicCompanyId: 'a', deterministicSource: 'only_company' }),
    );
    expect(actual.documentCategory).toBeNull();
    expect(actual.companyId).toBe('a');
    expect(actual.companyMatchSource).toBe('only_company');
  });

  it('skips the LLM entirely when there is no usable text', async () => {
    let invoked = false;
    const service = new DocumentPreclassifierService({
      llmInvoker: async () => {
        invoked = true;
        return {
          documentCategory: 'FATTURA',
          categoryConfidence: 1,
          companyId: 'a',
          companyConfidence: 1,
          reason: 'r',
        };
      },
    });
    const actual = await service.preclassify(
      baseInput({ text: '   ', deterministicCompanyId: 'a', deterministicSource: 'only_company' }),
    );
    expect(invoked).toBe(false);
    expect(actual.documentCategory).toBeNull();
    expect(actual.companyId).toBe('a');
  });

  it('uses the deterministic category when confidence is above threshold', async () => {
    const service = new DocumentPreclassifierService({
      llmInvoker: llm({ documentCategory: 'FATTURA', categoryConfidence: 0.99 }),
    });
    const actual = await service.preclassify(
      baseInput({
        deterministicCategory: 'PIANO_COLTURALE',
        deterministicCategoryConfidence: 1,
        deterministicCategoryReason: 'Veneto PCG ZIP',
      }),
    );
    expect(actual.documentCategory).toBe('PIANO_COLTURALE');
    expect(actual.categoryConfidence).toBe(1);
    expect(actual.reason).toBe('Veneto PCG ZIP');
  });
});
