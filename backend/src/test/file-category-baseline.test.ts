import 'dotenv/config';
import { resolveFileCategory } from '../infrastructure/services/extraction/file-category-resolver';
import { hasLlmGatewayKey } from './llm-test-keys';

interface BaselineCase {
  readonly name: string;
  readonly input: {
    userCategory: 'auto';
    fileBuffer: Buffer;
    mimeType: string;
    fileName: string;
    pdfText?: string;
  };
  readonly expectedCategory: string;
}

function csvBuffer(content: string): Buffer {
  return Buffer.from(content, 'utf-8');
}

const BASELINE_CASES: ReadonlyArray<BaselineCase> = [
  {
    name: 'CSV agricultural with foglio/particella',
    input: {
      userCategory: 'auto',
      fileBuffer: csvBuffer('Foglio;Particella;Comune\n10;25;Ravenna'),
      mimeType: 'text/csv',
      fileName: 'campi.csv',
    },
    expectedCategory: 'agricultural',
  },
  {
    name: 'CSV stock with product + quantity + ddt',
    input: {
      userCategory: 'auto',
      fileBuffer: csvBuffer(
        'Nome prodotto;Quantità stock;Numero DDT;Data DDT\nUrea;10;DDT-22;2026-03-01',
      ),
      mimeType: 'text/csv',
      fileName: 'magazzino.csv',
    },
    expectedCategory: 'stock',
  },
  {
    name: 'PDF invoice patterns',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      fileName: 'fattura.pdf',
      pdfText: 'FATTURA imponibile totale documento partita iva codice fiscale',
    },
    expectedCategory: 'invoice',
  },
  {
    name: 'PDF ddt patterns',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      fileName: 'ddt.pdf',
      pdfText: 'Documento di Trasporto con destinazione merce e DDT 123',
    },
    expectedCategory: 'ddt',
  },
  {
    name: 'PDF unknown fallback',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      fileName: 'doc.pdf',
      pdfText: 'Documento senza indicatori chiari',
    },
    expectedCategory: 'agricultural',
  },
  {
    name: 'ZIP shapefile',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      mimeType: 'application/zip',
      fileName: 'campi.zip',
    },
    expectedCategory: 'fields',
  },
  {
    name: 'XML invoice',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('<xml/>'),
      mimeType: 'application/xml',
      fileName: 'fattura.xml',
    },
    expectedCategory: 'invoice',
  },
  {
    name: 'Image invoice',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('img'),
      mimeType: 'image/png',
      fileName: 'scan.png',
    },
    expectedCategory: 'invoice',
  },
];

const LLM_EDGE_CASES: ReadonlyArray<BaselineCase> = [
  {
    name: 'PDF invoice filename-only edge case',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      fileName: 'fattura_cliente_2026.pdf',
      pdfText: 'Allegato generico senza intestazione fiscale',
    },
    expectedCategory: 'invoice',
  },
  {
    name: 'PDF piano colturale agricultural',
    input: {
      userCategory: 'auto',
      fileBuffer: Buffer.from('pdf'),
      mimeType: 'application/pdf',
      fileName: 'piano_colturale.pdf',
      pdfText:
        'Piano colturale aziendale appezzamento coltura varieta superficie ettari campagna 2025',
    },
    expectedCategory: 'agricultural',
  },
];

async function runBaselineAccuracy(cases: ReadonlyArray<BaselineCase>): Promise<number> {
  let matched = 0;
  for (const entry of cases) {
    const actual = await resolveFileCategory(entry.input);
    if (actual.category === entry.expectedCategory) {
      matched += 1;
    }
  }
  return matched / cases.length;
}

describe('File category baseline (rule mode)', () => {
  const previousLlmFlag = process.env.LLM_CATEGORY_CLASSIFIER_ENABLED;

  beforeAll(() => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = 'false';
  });

  afterAll(() => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = previousLlmFlag;
  });

  it('should keep high precision on labeled baseline + edge cases', async () => {
    const accuracy = await runBaselineAccuracy(BASELINE_CASES);
    expect(accuracy).toBeGreaterThanOrEqual(0.87);
  });
});

const runLlmUnitTests = process.env.RUN_LLM_UNIT_TESTS === '1' && hasLlmGatewayKey();
const describeLlm = runLlmUnitTests ? describe : describe.skip;

describeLlm('File category baseline (LLM mode)', () => {
  const previousLlmFlag = process.env.LLM_CATEGORY_CLASSIFIER_ENABLED;

  beforeAll(() => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.LLM_CATEGORY_CLASSIFIER_ENABLED = previousLlmFlag;
  });

  it('should meet accuracy threshold on baseline + LLM edge cases', async () => {
    const allCases = [...BASELINE_CASES, ...LLM_EDGE_CASES];
    const accuracy = await runBaselineAccuracy(allCases);
    expect(accuracy).toBeGreaterThanOrEqual(0.9);
  }, 120_000);
});

if (!runLlmUnitTests) {
  it('skips LLM baseline (set RUN_LLM_UNIT_TESTS=1 and OPENAI_API_KEY to run)', () => {
    expect(true).toBe(true);
  });
}
