import { CategoryClassifierService } from '../infrastructure/services/extraction/category-classifier.service';

describe('CategoryClassifierService', () => {
  const previousFlag = process.env.LLM_CATEGORY_CLASSIFIER_ENABLED;
  const previousApiKey = process.env.OPENAI_API_KEY;
  const previousOpenRouterKey = process.env.OPENROUTER_API_KEY;
  const previousGateway = process.env.LLM_GATEWAY;

  beforeEach(() => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = 'true';
    process.env.OPENROUTER_API_KEY = 'test-key';
    delete process.env.LLM_GATEWAY;
  });

  afterAll(() => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = previousFlag;
    process.env.OPENAI_API_KEY = previousApiKey;
    process.env.OPENROUTER_API_KEY = previousOpenRouterKey;
    process.env.LLM_GATEWAY = previousGateway;
  });

  it('should use llm by default when OPENAI_API_KEY is set', async () => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = undefined;
    process.env.LLM_GATEWAY = 'openai';
    process.env.OPENAI_API_KEY = 'test-key';
    delete process.env.OPENROUTER_API_KEY;
    let invoked = false;
    const service = new CategoryClassifierService({
      llmInvoker: async () => {
        invoked = true;
        return { category: 'invoice', confidence: 0.9, reason: 'invoice doc' };
      },
    });
    const result = await service.classifyAuto({
      fileBuffer: Buffer.from('contenuto ambiguo'),
      mimeType: 'application/pdf',
      fileName: 'doc.pdf',
      pdfText: 'documento commerciale senza segnali forti',
    });
    expect(invoked).toBe(true);
    expect(result.category).toBe('invoice');
  });

  it('should apply csv guardrail when llm returns invoice', async () => {
    const service = new CategoryClassifierService({
      llmInvoker: async () => ({
        category: 'invoice',
        confidence: 0.95,
        reason: 'looks like invoice',
      }),
    });

    const result = await service.classifyAuto({
      fileBuffer: Buffer.from('nome;qta;fornitore\na;1;b'),
      mimeType: 'text/csv',
      fileName: 'rows.csv',
    });

    expect(result.source).toBe('hybrid');
    expect(['agricultural', 'stock']).toContain(result.category);
  });

  it('should fallback to rules on low llm confidence', async () => {
    const service = new CategoryClassifierService({
      llmInvoker: async () => ({
        category: 'ddt',
        confidence: 0.2,
        reason: 'weak signal',
      }),
    });

    const result = await service.classifyAuto({
      fileBuffer: Buffer.from('random content'),
      mimeType: 'application/pdf',
      fileName: 'unknown.pdf',
      pdfText: 'testo senza segnali noti',
    });

    expect(result.source).toBe('hybrid');
    expect(result.category).toBe('agricultural');
  });

  it('should use cache for repeated low-confidence input', async () => {
    let count = 0;
    const service = new CategoryClassifierService({
      llmInvoker: async () => {
        count += 1;
        return {
          category: 'stock',
          confidence: 0.7,
          reason: 'stock-like fields',
        };
      },
    });

    const input = {
      fileBuffer: Buffer.from('nome prodotto;qta;numero ddt'),
      mimeType: 'text/csv',
      fileName: 'import.csv',
    };
    const first = await service.classifyAuto(input);
    const second = await service.classifyAuto(input);

    expect(first.fromCache).toBe(false);
    expect(second.fromCache).toBe(true);
    expect(count).toBe(1);
  });
});
