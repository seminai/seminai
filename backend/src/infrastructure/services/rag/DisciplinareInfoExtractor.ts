import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import {
  DisciplinareActiveIngredientInfo,
  DisciplinareSourceCitation,
} from '../../../domain/dtos/rule-rag.types';
import { createChatModel } from '../llm-model-factory';

const usageLogger = LlmUsageLogger.getInstance();

const EXTRACTION_MODEL = 'gpt-4o-mini';
const MAX_CHUNK_CHARS = 8000;

const EXTRACTION_PROMPT = `Sei un esperto di disciplinari di produzione integrata italiani.
Ti vengono forniti dei frammenti di testo estratti da un disciplinare PDF e il nome di una sostanza attiva.

Analizza i frammenti e estrai le informazioni strutturate per la sostanza attiva indicata.

SOSTANZA ATTIVA DA CERCARE: {activeIngredient}
COLTURA: {cropName}

FRAMMENTI DAL DISCIPLINARE:
---
{chunks}
---

Rispondi con un JSON nel seguente schema. Se un'informazione non è presente nel testo, usa null o array vuoto.

{{
  "sostanza_attiva": "{activeIngredient}",
  "avversita": ["lista di avversità/malattie per cui la sostanza attiva è ammessa"],
  "dosaggi": "dosaggi se presenti nel disciplinare (es. '2 kg/ha'), altrimenti null",
  "n_max_interventi_sa": "numero massimo interventi per questa singola SA o sottogruppo (colonna 1), o null",
  "n_max_interventi_sa_scope": "anno oppure ciclo colturale oppure null",
  "n_max_interventi_gruppo": "numero massimo interventi condivisi per il gruppo SA (colonna 2), o null",
  "n_max_interventi_gruppo_scope": "anno oppure ciclo colturale oppure null",
  "gruppo_sostanze_attive": ["nomi delle altre SA che condividono il vincolo di gruppo con questa SA"],
  "limitazioni_uso_e_note": "eventuali limitazioni, note, condizioni d'uso, asterischi spiegati"
}}

IMPORTANTE:
- Distingui tra vincoli per singola SA (colonna 1) e vincoli per gruppo (colonna 2).
- Esempio vincolo di gruppo: "12 interventi tra Ditianon, Fluazinam e Folpet" → n_max_interventi_gruppo = 12.
- Esempio vincolo singola SA: "max 2 interventi" senza specificare un gruppo → n_max_interventi_sa = 2.
- Cerca frasi come "Indipendentemente dall'avversità", "massimo X interventi", "N° max interventi".
- Se la sostanza attiva non è menzionata nei frammenti, restituisci null per i campi numerici e array vuoti per le liste.
- Riporta le note con asterischi spiegati (es. "(*) Si raccomanda di non superare 4 kg di s.a./ha/anno").
- MATCHING COLTURA: La coltura indicata potrebbe essere un nome generico (es. "vite") ma nei frammenti potrebbe apparire come nome completo (es. "Vite da uva da vino"). Considera TUTTE le varianti della coltura indicata. Ad esempio "vite" include "Vite da uva da vino" e "Vite da uva da tavola".

Rispondi SOLO con il JSON, senza testo aggiuntivo.`;

interface LlmExtractionResult {
  sostanza_attiva: string;
  avversita: string[];
  dosaggi: string | null;
  n_max_interventi_sa: number | null;
  n_max_interventi_sa_scope: string | null;
  n_max_interventi_gruppo: number | null;
  n_max_interventi_gruppo_scope: string | null;
  gruppo_sostanze_attive: string[];
  limitazioni_uso_e_note: string | null;
}

interface ExtractionContext {
  readonly userId?: string;
  readonly companyId?: string;
  readonly jobId?: string;
  readonly jobGroupId?: string;
}

/**
 * Extracts structured disciplinare info for active ingredients from RAG chunks via LLM.
 */
export class DisciplinareInfoExtractor {
  /**
   * Extracts disciplinare info for a single active ingredient from RAG chunks.
   */
  async extractForActiveIngredient(params: {
    activeIngredient: string;
    cropName: string;
    chunks: ReadonlyArray<{ content: string; score: number }>;
    ruleId: string;
    ruleName: string;
    pdfFileUrl: string | null;
    context?: ExtractionContext;
  }): Promise<DisciplinareActiveIngredientInfo | null> {
    const { activeIngredient, cropName, chunks, ruleId, ruleName, pdfFileUrl, context } = params;

    if (chunks.length === 0) return null;

    // Concatenate chunks, capped at MAX_CHUNK_CHARS
    let concatenated = '';
    const usedChunks: string[] = [];
    for (const chunk of chunks) {
      if (concatenated.length + chunk.content.length > MAX_CHUNK_CHARS) {
        const remaining = MAX_CHUNK_CHARS - concatenated.length;
        if (remaining > 200) {
          const truncated = chunk.content.substring(0, remaining);
          concatenated += '\n\n' + truncated;
          usedChunks.push(truncated);
        }
        break;
      }
      concatenated += (concatenated ? '\n\n' : '') + chunk.content;
      usedChunks.push(chunk.content);
    }

    if (concatenated.trim().length < 50) return null;

    try {
      const { model: llm, modelName } = createChatModel({
        modelName: EXTRACTION_MODEL,
        temperature: 0,
        maxTokens: 2000,
      });

      const tracker = usageLogger.createTracker();
      const parser = new JsonOutputParser<LlmExtractionResult>();
      const prompt = PromptTemplate.fromTemplate(EXTRACTION_PROMPT);
      const chain = prompt.pipe(llm).pipe(parser);

      const result = await chain.invoke(
        {
          activeIngredient,
          cropName,
          chunks: concatenated,
        },
        { callbacks: tracker.callbacks },
      );

      await usageLogger.logFromAccumulator(tracker.accumulator, {
        userId: context?.userId,
        companyId: context?.companyId,
        jobId: context?.jobId,
        jobGroupId: context?.jobGroupId,
        jobType: LlmJobType.LABEL,
        model: modelName,
        metadata: {
          step: 'disciplinare-info-extraction',
          activeIngredient,
          cropName,
          ruleId,
        },
      });

      // Build source citation
      const source: DisciplinareSourceCitation = {
        ruleName,
        ruleId,
        pdfFileUrl,
        chunkText: usedChunks.join('\n---\n').substring(0, 1000),
      };

      return {
        sostanza_attiva: result.sostanza_attiva ?? activeIngredient,
        avversita: Array.isArray(result.avversita) ? result.avversita : [],
        dosaggi: result.dosaggi ?? null,
        n_max_interventi_sa:
          typeof result.n_max_interventi_sa === 'number' ? result.n_max_interventi_sa : null,
        n_max_interventi_sa_scope: result.n_max_interventi_sa_scope ?? null,
        n_max_interventi_gruppo:
          typeof result.n_max_interventi_gruppo === 'number'
            ? result.n_max_interventi_gruppo
            : null,
        n_max_interventi_gruppo_scope: result.n_max_interventi_gruppo_scope ?? null,
        gruppo_sostanze_attive: Array.isArray(result.gruppo_sostanze_attive)
          ? result.gruppo_sostanze_attive
          : [],
        limitazioni_uso_e_note: result.limitazioni_uso_e_note ?? null,
        sources: [source],
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn(`[DISCIPLINARE-INFO] LLM extraction failed for ${activeIngredient}: ${msg}`);
      return null;
    }
  }
}
