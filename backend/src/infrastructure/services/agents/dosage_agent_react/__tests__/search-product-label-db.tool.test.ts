import type { Label } from '../../../../../domain/dtos/label.dto';
import {
  LabelCategory,
  type LabelExtractionRecord,
} from '../../../../../domain/repositories/ILabelExtractionRepository';
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
        istruzioni: 'Non trattare su terreni sabbiosi.',
      },
    ],
    fasce_di_rispetto_e_deriva: [],
    fasce_rispetto_acqua: null,
    fasce_rispetto_colture: null,
    avvertenze: ['Non trattare su varieta sensibili.'],
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

describe('search_product_label_database tool', () => {
  afterEach(() => {
    mockSearchByProductName.mockReset();
    _resetWorkingMemoryForTesting();
  });

  it('returns compact label facts with explicit buffer status', async () => {
    mockSearchByProductName.mockResolvedValue([buildRecord()]);
    const tool = createSearchProductLabelDatabaseTool('thread-label-tool');

    const result = await tool.invoke({ productName: 'Metriphar', cropName: 'Patata' });
    const parsed = JSON.parse(String(result)) as {
      readonly dosaggiDettagliati: ReadonlyArray<{ readonly dose: string }>;
      readonly fasceRispettoAcqua: string | null;
      readonly fasceRispettoColture: string | null;
      readonly fasceDeriva: readonly string[];
      readonly fasceStatus: string;
      readonly fasceMessage: string;
      readonly avvertenze: readonly string[];
      readonly labelFacts: { readonly doseFacts: ReadonlyArray<{ readonly phiDays: number }> };
    };

    expect(parsed.dosaggiDettagliati[0].dose).toBe('250-400 g/ha');
    expect(parsed.labelFacts.doseFacts[0].phiDays).toBe(60);
    expect(parsed.fasceRispettoAcqua).toBeNull();
    expect(parsed.fasceRispettoColture).toBeNull();
    expect(parsed.fasceDeriva).toEqual([]);
    expect(parsed.fasceStatus).toBe('not_found');
    expect(parsed.fasceMessage).toContain('Nessuna fascia');
    expect(parsed.avvertenze[0]).toContain('sensibili');
  });
});
