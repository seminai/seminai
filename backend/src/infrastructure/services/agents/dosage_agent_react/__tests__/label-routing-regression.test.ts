import { AIMessage, HumanMessage } from '@langchain/core/messages';
import type { Label } from '../../../../../domain/dtos/label.dto';
import {
  LabelCategory,
  type LabelExtractionRecord,
} from '../../../../../domain/repositories/ILabelExtractionRepository';
import { createGuardNode } from '../graph/nodes';
import { createToolCallRecord } from '../graph/tool-call-record';
import { LoopDetector } from '../loop-detector';
import type { DosageReactState } from '../type/state';
import { _resetWorkingMemoryForTesting } from '../working-memory';

const mockSearchByProductName = jest.fn();

jest.mock('../../../../repositories/Prisma', () => ({ prisma: {} }));
jest.mock('../../../../repositories/PrismaLabelExtractionRepository', () => ({
  PrismaLabelExtractionRepository: jest.fn().mockImplementation(() => ({
    searchByProductName: mockSearchByProductName,
  })),
}));

import { createSearchProductLabelDatabaseTool } from '../tools/search-product-label-db.tool';

function buildLabel(): Label {
  return {
    prodotto: 'METRIPHAR 70 WG',
    categoria: 'Erbicida selettivo',
    principio_attivo: 'Metribuzin',
    composizione: 'Metribuzin puro 70%',
    meccanismo_azione_frac: null,
    malattie: [],
    specie: [],
    colture_target: ['Patata'],
    dosaggi_dettagliati: [
      {
        coltura: 'Patata',
        dose_minima: 250,
        dose_massima: 400,
        dose_um: 'g/ha',
        epoca_impiego: 'pre-emergenza',
        intervallo_sicurezza_giorni: 60,
      },
      {
        coltura: 'Patata',
        dose_minima: 250,
        dose_massima: 300,
        dose_um: 'g/ha',
        epoca_impiego: 'post-emergenza',
        intervallo_sicurezza_giorni: 60,
      },
    ],
    fasce_di_rispetto_e_deriva: [],
    fasce_rispetto_acqua: null,
    fasce_rispetto_colture: null,
    avvertenze: ['Non trattare su terreni sabbiosi.'],
    frasi_pericolo: ['H410'],
    frasi_prudenza: [],
    compatibilita: null,
    fitotossicita: null,
    note_tecniche: null,
    extraction_confidence: 95,
    extracted_fields: [],
    errors: [],
  };
}

function buildRecord(): LabelExtractionRecord {
  const now = new Date('2026-06-08T09:00:00.000Z');
  return {
    id: 'label-1',
    productName: 'METRIPHAR 70 WG',
    registrationNumber: '10577',
    normalizedProductName: 'metriphar 70 wg',
    normalizedRegistrationNumber: '10577',
    sourceUrl: 'https://example.test/label.pdf',
    sourcePdfHash: null,
    rawTextHash: null,
    officialSourceUrl: null,
    category: LabelCategory.FITO,
    label: buildLabel(),
    rawText: '',
    extractionConfidence: 95,
    isVerified: false,
    extractedFields: [],
    errors: [],
    qualityExtraction: [],
    lastRefreshedAt: now,
    lastRefreshStatus: null,
    lastRefreshError: null,
    isArchived: false,
    archivedAt: null,
    archivedReason: null,
    canonicalLabelExtractionId: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildRepeatedDosageState(): DosageReactState {
  const aiMessage = new AIMessage({ content: '' });
  (
    aiMessage as AIMessage & {
      tool_calls: Array<{ name: string; args: Record<string, unknown>; id: string }>;
    }
  ).tool_calls = [
    {
      name: 'calculate_dosage',
      args: { strategy: 'avg', outStockLimiter: false },
      id: 'tc-dosage-loop',
    },
  ];
  const record = createToolCallRecord({
    name: 'calculate_dosage',
    args: { strategy: 'avg', outStockLimiter: false },
  });
  return {
    messages: [
      new HumanMessage('hai informazioni su fasce di rispetto di metriphar su patata?'),
      aiMessage,
    ],
    loopCounter: 2,
    lastToolCalls: ['calculate_dosage', 'calculate_dosage'],
    lastToolCallRecords: [record, record],
    taskList: [],
  };
}

describe('label routing regression with mocked tools', () => {
  afterEach(() => {
    mockSearchByProductName.mockReset();
    _resetWorkingMemoryForTesting();
  });

  it('uses cached label data when repeated dosage calls would otherwise loop', async () => {
    const threadId = 'thread-label-routing-regression';
    mockSearchByProductName.mockResolvedValue([buildRecord()]);
    const labelTool = createSearchProductLabelDatabaseTool(threadId);
    await labelTool.invoke({ productName: 'Metriphar', cropName: 'Patata' });

    const result = await createGuardNode(new LoopDetector(), { threadId })(
      buildRepeatedDosageState(),
    );

    const finalContent = String(result.messages?.[1].content);
    expect(finalContent).toContain('250-400 g/ha');
    expect(finalContent).toContain('250-300 g/ha');
    expect(finalContent).toContain('Nessuna fascia');
    expect(finalContent).not.toContain('Mi sono fermato');
    expect(finalContent).not.toContain('ciclo tecnico');
  });
});
