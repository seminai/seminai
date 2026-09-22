import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { DosageAgentContext, hasContext } from '../../services/agents/dosage_agent/context';
import { Label } from '../../../domain/dtos/label.dto';
import { DosageLoggerService } from '../dosage-logger.service';
import { createChatModel } from '../llm-model-factory';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { sanitizeLabel } from '../utils/cleanText';
import { LlmJobType } from '@prisma/client';
import { LabelExtractionError } from '../../../domain/errors/LabelExtractionError';
import { resolveLabelExtractionModelName } from '../llm-config';
import { usageLogger } from './extractDataFromLabel.part-01-estimate-tokens';
import { extractStructuredTreatmentDataWithLlm } from './extractDataFromLabel.part-05-extract-structured-treatment-data-with-llm';

/**
 * Retry extraction with a more concise prompt to avoid JSON truncation.
 * Used when the first attempt fails due to JSON parsing errors.
 */
export async function extractSingleChunkConcise(
  text: string,
  modelName: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
  retryAttempt: number = 0,
): Promise<Label> {
  const maxRetries = 2;
  try {
    const effectiveModel = process.env.OPENAI_MODEL || modelName;
    const modelMessage = `Using model: ${effectiveModel} (concise retry attempt ${retryAttempt})`;
    console.log(`[LABEL_EXTRACTION] ${modelMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: modelMessage,
        metadata: { model: effectiveModel, retryAttempt },
      });
    }
    const { model: llm } = createChatModel({
      modelName: effectiveModel,
      temperature: 0.1,
      maxTokens: 16000,
    });
    const tracker = usageLogger.createTracker(callbacks);
    const parser = new JsonOutputParser<Label>();
    // Concise prompt - shorter instructions, focus on essential data only
    const prompt = PromptTemplate.fromTemplate(`
Sei un esperto nell'estrazione di dati da etichette di prodotti fitosanitari.
Analizza il testo e estrai le informazioni in formato JSON CONCISO.

IMPORTANTE - FORMATO CONCISO:
- Mantieni i campi testuali BREVI (max 100 caratteri per istruzioni/modalita_applicazione)
- Per dosaggi_dettagliati: includi SOLO coltura, dose_minima, dose_massima, dose_um, epoca_impiego
- Ometti campi opzionali se non essenziali
- NON includere testo lungo nelle istruzioni

SCHEMA JSON (usa null per campi assenti):
{{
  "prodotto": "string",
  "categoria": "string",
  "formulazione": "string",
  "principio_attivo": "string",
  "composizione": "string",
  "meccanismo_azione_frac": "string",
  "malattie": ["string"],
  "specie": ["string"],
  "colture_target": ["string"],
  "colture_target_fuori_periodo_di_prodizione": ["string"],
  "dosaggi_dettagliati": [{{
    "coltura": "string",
    "malattia": "string",
    "dose_minima": number,
    "dose_massima": number,
    "dose_um": "string",
    "acqua_max": number,
    "acqua_max_um": "string",
    "n_max_applicazioni": number,
    "n_max_applicazioni_um": "string",
    "intervallo_min_giorni": number,
    "intervallo_sicurezza_giorni": number,
    "epoca_impiego": "string",
    "modalita_applicazione": "string (BREVE)",
    "istruzioni": "string (BREVE)"
  }}],
  "fasce_di_rispetto_e_deriva": ["string"],
  "fasce_rispetto_acqua": "string",
  "fasce_rispetto_colture": "string",
  "avvertenze": ["string"],
  "frasi_pericolo": ["string"],
  "frasi_prudenza": ["string"],
  "compatibilita": "string",
  "fitotossicita": "string",
  "note_tecniche": "string (BREVE)",
  "numero_registrazione": "string",
  "titolare": "string",
  "stabilimento": "string",
  "caratteristiche": "string",
  "resistenze": [{{
    "prodotti_da_evitare": ["string"],
    "famiglie_chimiche_da_evitare": ["string"],
    "n_min_applicazioni": number,
    "n_max_applicazioni": number,
    "n_max_applicazioni_um": "string",
    "periodo_tempo": "string",
    "colture_interessate": ["string"],
    "raccomandazioni": "string (BREVE)",
    "testo_completo": null
  }}],
  "extraction_confidence": number,
  "extracted_fields": ["string"],
  "errors": ["string"]
}}

TESTO:
{text}

{format_instructions}

Rispondi SOLO con JSON valido e CONCISO.
`);
    const chain = prompt.pipe(llm).pipe(parser);
    const result = await chain.invoke(
      {
        text,
        format_instructions: parser.getFormatInstructions(),
      },
      { callbacks: tracker.callbacks },
    );
    const sanitized = sanitizeLabel(result);
    const dosaggiCount = Array.isArray(sanitized.dosaggi_dettagliati)
      ? sanitized.dosaggi_dettagliati.length
      : 0;
    const extractedMessage = `Extracted ${dosaggiCount} dosaggio entries (concise retry)`;
    console.log(`[LABEL_EXTRACTION] ${extractedMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: extractedMessage,
        metadata: { dosaggiCount, retryAttempt },
      });
    }

    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.LABEL,
      model: effectiveModel,
      metadata: { step: 'label-chunk-concise-retry', chunkLength: text.length, retryAttempt },
    });
    return sanitized;
  } catch (err) {
    const errName = err instanceof Error ? err.name : 'UnknownError';
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const errorMessage = `Error in concise chunk extraction (attempt ${retryAttempt + 1}) [${errName}]: ${errMsg}`;
    console.error(`[LABEL_EXTRACTION] ${errorMessage}`);
    if (errStack) {
      console.error(`[LABEL_EXTRACTION] Stack: ${errStack}`);
    }

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logError({
        jobId: context.jobId,
        userId: context.userId,
        message: errorMessage,
        error: err instanceof Error ? err : new Error(String(err)),
        metadata: { errorName: errName, retryAttempt, stack: errStack },
      });
    }

    const isJsonParsingError =
      err instanceof Error &&
      (err.message.includes('JSON') ||
        err.message.includes('Unterminated') ||
        err.message.includes('parse') ||
        err.message.includes('Unexpected token') ||
        err.message.includes('Expected') ||
        err.message.includes('SyntaxError') ||
        err.name === 'SyntaxError');

    if (isJsonParsingError && retryAttempt < maxRetries) {
      const retryMessage = `Retrying concise extraction (attempt ${retryAttempt + 2}/${maxRetries + 1})`;
      console.log(`[LABEL_EXTRACTION] ${retryMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logWarning({
          jobId: context.jobId,
          userId: context.userId,
          message: retryMessage,
          metadata: { retryAttempt: retryAttempt + 1 },
        });
      }

      return extractSingleChunkConcise(text, modelName, callbacks, context, retryAttempt + 1);
    }

    throw new LabelExtractionError(
      `Label extraction failed after ${retryAttempt + 1} concise attempt(s): [${errName}] ${errMsg}`,
      err instanceof Error ? err : undefined,
    );
  }
}

export const LABEL_EXTRACTION_MODEL = resolveLabelExtractionModelName();

/**
 * Extracts structured label data using OpenRouter chat completion.
 * @deprecated Use extractStructuredTreatmentDataWithLlm — alias kept for backward compatibility.
 */
export async function extractStructuredTreatmentDataWithMistral(
  text: string,
  context?: DosageAgentContext,
): Promise<Label> {
  return extractStructuredTreatmentDataWithLlm(text, context);
}
