import { z } from 'zod';
import type { ChatOpenAI } from '@langchain/openai';
import pLimit from 'p-limit';
import { pdfToText } from '../../ocr/pdfToText';
import { invokeLLMWithRetry } from './utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../../llm_costs/llm-usage-logger';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import {
  categorizePages,
  splitIntoParticellaBlocks,
  chunkArray,
  MAX_PARTICELLE_PER_CHUNK,
} from './piano-colturale-text-utils';
import { convertToFieldData, convertToProductionUnitData } from './piano-colturale-converters';
import type { ExtractedFieldData } from './field_csv_agent';
import type { ProductionUnitExtractionResult } from '../production_unit/production_unit_csv_agent';
import { createChatModel } from '../../llm-model-factory';

const LLM_CONCURRENCY = 3;

const usageLogger = LlmUsageLogger.getInstance();

// ---------------------------------------------------------------------------
// Zod schema for LLM structured extraction from Piano Colturale PDF
// ---------------------------------------------------------------------------

const ColturaSchema = z.object({
  codice: z.string().nullable().describe('Codice numerico coltura, e.g. "410", "157", "789"'),
  nome: z
    .string()
    .describe(
      'Nome coltura completo, e.g. "VITE - DA VINO", "USO NON AGRICOLO - FABBRICATI", "MARGINI (BORDI) DEI CAMPI"',
    ),
  varieta: z
    .string()
    .nullable()
    .describe('Varietà, e.g. "NESSUNA VARIETA" oppure il nome della varietà. Null se assente'),
  criterioMantenimento: z
    .string()
    .nullable()
    .describe(
      'Criterio di mantenimento, e.g. "Pratica Ordinaria", "Inerbimento - Pratica ordinaria (ECO 2)"',
    ),
  tipoAgricoltura: z.string().nullable().describe('"Convenzionale" o "Biologico"'),
  dataInizio: z.string().nullable().describe('Data inizio nel formato DD/MM/YYYY'),
  dataFine: z.string().nullable().describe('Data fine nel formato DD/MM/YYYY'),
  superficieHa: z.number().describe('Superficie in ettari'),
});

const ParticellaSchema = z.object({
  provincia: z.string().describe('Sigla provincia, e.g. "MO"'),
  comune: z.string().describe('Nome comune, e.g. "NOVI DI MODENA"'),
  sezione: z.string().nullable().describe('Sezione catastale, null se vuota'),
  foglio: z.string().describe('Numero foglio catastale'),
  particella: z.string().describe('Numero particella catastale'),
  subalterno: z.string().nullable().describe('Subalterno, null se assente'),
  superficieTotaleHa: z.number().nullable().describe('Superficie Totale in Ha (dal riepilogo)'),
  superficieSauHa: z.number().nullable().describe('Superficie SAU al 15/05 in Ha (dal riepilogo)'),
  colture: z.array(ColturaSchema).describe('Lista colture sulla particella'),
});

const PianoColturaleSchema = z.object({
  azienda: z.object({
    ragioneSociale: z.string().nullable(),
    comune: z.string().nullable(),
    provincia: z.string().nullable(),
    cap: z.string().nullable(),
    indirizzo: z.string().nullable(),
  }),
  particelle: z.array(ParticellaSchema).describe('Lista di tutte le particelle trovate nel testo'),
});

export type PianoColturaleData = z.infer<typeof PianoColturaleSchema>;

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

/**
 * Agent for extracting fields and production units from AGREA "Piano Colturale"
 * PDF files (Emilia-Romagna format).
 *
 * Large documents are split into individual particella blocks and processed
 * in LLM-sized chunks to ensure complete and reliable extraction.
 */
export type PdfChunkProgressCallback = (chunkIndex: number, totalChunks: number) => void;

export class PianoColturalePdfAgent {
  private model: ChatOpenAI | null = null;

  async extractFromPdf(
    pdfBuffer: Buffer,
    onChunkProgress?: PdfChunkProgressCallback,
  ): Promise<{
    fields: ExtractedFieldData;
    productionUnits: ProductionUnitExtractionResult;
  }> {
    console.log('PianoColturalePdfAgent: Extracting text from PDF...');
    const { text, pageCount } = await pdfToText(pdfBuffer);
    console.log(`PianoColturalePdfAgent: Extracted ${pageCount} pages of text`);

    const { aziendaText, pianoColturaleText, pianoColturalePageCount } = categorizePages(text);
    const blocks = splitIntoParticellaBlocks(pianoColturaleText);

    console.log(
      `PianoColturalePdfAgent: ${pianoColturalePageCount} piano colturale pages, ` +
        `${blocks.length} particella blocks`,
    );

    if (blocks.length === 0) {
      throw new Error(
        'Sezione "PIANO COLTURALE ALFANUMERICO" non trovata nel PDF. ' +
          'Assicurarsi che il PDF sia una stampa definitiva AGREA.',
      );
    }

    const extracted = await this.extractInChunks(aziendaText, blocks, onChunkProgress);
    console.log(`PianoColturalePdfAgent: Extracted ${extracted.particelle.length} particelle`);

    const fields = convertToFieldData(extracted);
    const productionUnits = convertToProductionUnitData(extracted);
    console.log(
      `PianoColturalePdfAgent: Result - ${fields.fields.length} fields, ` +
        `${productionUnits.units.length} production units`,
    );

    return { fields, productionUnits };
  }

  // -----------------------------------------------------------------------
  // Chunked extraction by particella blocks
  // -----------------------------------------------------------------------

  private async extractInChunks(
    aziendaText: string,
    blocks: string[],
    onChunkProgress?: PdfChunkProgressCallback,
  ): Promise<PianoColturaleData> {
    const chunks = chunkArray(blocks, MAX_PARTICELLE_PER_CHUNK);
    console.log(
      `PianoColturalePdfAgent: Processing ${blocks.length} blocks in ${chunks.length} chunk(s) ` +
        `with concurrency ${LLM_CONCURRENCY}`,
    );

    let completedCount = 0;
    const limit = pLimit(LLM_CONCURRENCY);

    const tasks = chunks.map((chunk, i) =>
      limit(async () => {
        console.log(
          `PianoColturalePdfAgent: Chunk ${i + 1}/${chunks.length} (${chunk.length} blocks) - start`,
        );

        const chunkText = aziendaText
          ? `${aziendaText}\n\n---\n\n${chunk.join('\n\n')}`
          : chunk.join('\n\n');

        const result = await this.extractStructuredData(chunkText);
        completedCount++;

        console.log(
          `PianoColturalePdfAgent: Chunk ${i + 1}/${chunks.length} - done ` +
            `(${completedCount}/${chunks.length} completed)`,
        );
        onChunkProgress?.(completedCount - 1, chunks.length);

        return result;
      }),
    );

    const results = await Promise.all(tasks);

    let azienda: PianoColturaleData['azienda'] | null = null;
    const allParticelle: PianoColturaleData['particelle'] = [];

    for (const result of results) {
      if (!azienda && result.azienda) azienda = result.azienda;
      allParticelle.push(...result.particelle);
    }

    const deduplicated = this.deduplicateParticelle(allParticelle);

    return {
      azienda: azienda ?? {
        ragioneSociale: null,
        comune: null,
        provincia: null,
        cap: null,
        indirizzo: null,
      },
      particelle: deduplicated,
    };
  }

  /**
   * Remove duplicate particelle that might be extracted from overlapping context.
   * Keeps the entry with the most colture (most complete extraction).
   */
  private deduplicateParticelle(
    particelle: PianoColturaleData['particelle'],
  ): PianoColturaleData['particelle'] {
    const map = new Map<string, PianoColturaleData['particelle'][number]>();
    for (const p of particelle) {
      const key = `${p.provincia}|${p.comune}|${p.sezione ?? ''}|${p.foglio}|${p.particella}`;
      const existing = map.get(key);
      if (!existing || p.colture.length > existing.colture.length) {
        map.set(key, p);
      }
    }
    return Array.from(map.values());
  }

  // -----------------------------------------------------------------------
  // LLM structured extraction
  // -----------------------------------------------------------------------

  private async extractStructuredData(text: string): Promise<PianoColturaleData> {
    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(PianoColturaleSchema);

    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      {
        role: 'user' as const,
        content: `Estrai i dati strutturati da questo testo PDF:\n\n${text}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      messages,
      { callbacks: [usageCollector] },
      { maxRetries: 3, timeoutMs: 180_000 },
    );

    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'piano-colturale-pdf-extraction' },
      })
      .catch((err) => console.warn('[PIANO-COLTURALE-PDF] Failed to log usage:', err));

    return result as PianoColturaleData;
  }

  private getModel(): ChatOpenAI {
    if (!this.model) {
      const { model } = createChatModel({
        modelName: 'gpt-4o-mini',
        temperature: 0,
      });
      this.model = model;
    }
    return this.model;
  }
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `Sei un esperto di dati agricoli italiani. Analizza il testo estratto da un PDF "Piano Colturale" AGREA dell'Emilia-Romagna ed estrai i dati strutturati.

Il PDF contiene queste sezioni chiave:
1. **AZIENDA**: dati aziendali (Ragione Sociale, Comune, Provincia, CAP, Indirizzo)
2. **PIANO COLTURALE ALFANUMERICO**: tabella con dati delle particelle e colture

STRUTTURA PIANO COLTURALE ALFANUMERICO:
- Ogni blocco inizia con un header tipo:
  "(PC)ALTA VAL TIDONE - Sezione: A - Foglio: 11 - Particella: 00043 - Subalterno: null Irrigabilita' NO - Rotazione Colturale NESSUNO"
  Da qui estrai: provincia (PC), comune (ALTA VAL TIDONE), sezione (A, oppure null se vuota/"-"), foglio (11), particella (00043), subalterno (null → null)

- IMPORTANTE: La provincia è la sigla tra parentesi, il comune è il testo DOPO la parentesi e PRIMA di " - Sezione:". Non confondere con l'indirizzo dell'azienda.

- Sotto l'header ci sono righe con colture. Ogni riga ha:
  - Sup. (Ha): la superficie in ettari (formato italiano con virgola, es. "2,1680" → 2.168)
  - Epoca di Semina: es. "11/11/2024 - 10/11/2025" (dataInizio e dataFine)
  - Coltura/Varietà: es. "410 - VITE - 009 - DA VINO - 000 - - 000 -" → codice: "410", nome: "VITE - DA VINO"
  - Varietà: "000 - NESSUNA VARIETA'" → null
  - Tipo Agricoltura: "S Convenzionale" o "N Convenzionale" o "S Biologico"
  - Criterio di Mantenimento: es. "Pratica Ordinaria"

FORMATO COLTURA/VARIETA:
"410 - VITE - 009 - DA VINO - 000 - - 000 - 000 - NESSUNA VARIETA'"
→ codice: "410", nome: "VITE - DA VINO", varieta: null

"157 - USO NON AGRICOLO - FABBRICATI - 000 - - 000 - - 000 - NESSUNA VARIETA'"
→ codice: "157", nome: "USO NON AGRICOLO - FABBRICATI", varieta: null
REGOLE CRITICHE:
- Estrai TUTTE le particelle trovate nel testo, una per ogni header
- Per ogni particella estrai TUTTE le colture
- Le date sono in formato DD/MM/YYYY
- La superficie usa virgola decimale (es. "0,0050" → 0.005)
- Se la sezione è vuota, "-" o assente, metti null
- Se il subalterno è "null" o vuoto, metti null  
- Se la varietà è "NESSUNA VARIETA'" o simile, metti null
- Non saltare nessuna particella, anche se ha solo colture non agricole`;
