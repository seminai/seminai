import { createChatModel } from '../llm-model-factory';
import { resolveLabelExtractionModelName, hasChatLlmApiKey } from '../llm-config';
import { fetchChatCompletion, parseChatCompletionResponse } from '../llm-chat-completion-client';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { sanitizeLabel } from '../utils/cleanText';
import { Label } from '../../../domain/dtos/label.dto';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { DosageAgentContext, hasContext } from '../../services/agents/dosage_agent/context';
import { DosageLoggerService } from '../dosage-logger.service';
import { LabelExtractionError } from '../../../domain/errors/LabelExtractionError';
import { LlmJobType } from '@prisma/client';
import { LlmUsageLogger } from '../llm_costs/llm-usage-logger';
import { TokenUsage } from '../llm_costs/usage';

// types moved to domain: Label, LabelTextResult

/**
 * Estimates token count from text (rough estimate: 1 token ≈ 4 characters for English/Italian)
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Splits text into chunks with overlap to avoid losing context at boundaries.
 */
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    if (end >= text.length) break;
    start += chunkSize - overlap;
  }
  return chunks;
}

interface Section {
  readonly title: string;
  readonly content: string;
}

const usageLogger = LlmUsageLogger.getInstance();

function isHeadingCandidate(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith('#')) return true;
  if (trimmed.length < 4 || trimmed.length > 160) return false;
  const alphaChars = trimmed.replace(/[^A-Za-zÀ-Üà-ü]/g, '').length;
  if (alphaChars < 4) return false;
  const uppercaseChars = trimmed.replace(/[^A-ZÀ-Ü]/g, '').length;
  const uppercaseRatio = alphaChars > 0 ? uppercaseChars / alphaChars : 0;
  if (uppercaseRatio >= 0.7) return true;
  if (/^[0-9]+\s*[.)-]/.test(trimmed)) return true;
  if (/:\s*$/.test(trimmed)) return true;
  return false;
}

function splitTextIntoSections(text: string): Section[] {
  const lines = text.split(/\r?\n/);
  const sections: Section[] = [];
  let currentTitle = 'INTRODUZIONE';
  let buffer: string[] = [];

  const pushSection = (): void => {
    const content = buffer.join('\n').trim();
    if (content.length > 0) {
      sections.push({ title: currentTitle, content });
    }
    buffer = [];
  };

  for (const rawLine of lines) {
    if (isHeadingCandidate(rawLine)) {
      pushSection();
      currentTitle = rawLine.replace(/^#+\s*/, '').trim() || 'SEZIONE';
    } else {
      buffer.push(rawLine);
    }
  }

  pushSection();
  return sections;
}

function buildSectionChunks(sections: Section[], maxChars: number): string[] {
  if (sections.length === 0) {
    return [];
  }
  const chunks: string[] = [];
  let currentChunk = '';

  const appendChunk = (text: string): void => {
    if (currentChunk.length === 0) {
      currentChunk = text;
    } else if (currentChunk.length + text.length <= maxChars) {
      currentChunk += `\n${text}`;
    } else {
      chunks.push(currentChunk);
      currentChunk = text;
    }
  };

  sections.forEach((section) => {
    const payload = `## ${section.title}\n${section.content}`;
    if (payload.length > maxChars) {
      const subChunks = splitTextIntoChunks(
        payload,
        maxChars,
        Math.min(2000, Math.floor(maxChars / 4)),
      );
      subChunks.forEach((chunk) => appendChunk(chunk));
    } else {
      appendChunk(payload);
    }
  });

  if (currentChunk.length > 0) {
    chunks.push(currentChunk);
  }
  return chunks;
}

/**
 * Merges multiple partial Label objects into a single coherent Label using LLM.
 */
async function mergePartialLabels(
  partials: Label[],
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
): Promise<Label> {
  const modelForMerge = process.env.OPENAI_MODEL || 'gpt-4o';
  const message = `Merging with model: ${modelForMerge}`;
  console.log(`[LABEL_EXTRACTION] ${message}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message,
      metadata: { model: modelForMerge, partialsCount: partials.length },
    });
  }
  const { model: llm } = createChatModel({
    modelName: modelForMerge,
    temperature: 0,
    maxTokens: 16000,
  });
  const tracker = usageLogger.createTracker(callbacks);
  const parser = new JsonOutputParser<Label>();
  const prompt = PromptTemplate.fromTemplate(`
Sei un esperto di data integration. Ti vengono forniti più oggetti JSON parziali estratti da diverse sezioni dello stesso documento.
Il tuo compito è unire questi oggetti in un UNICO oggetto coerente seguendo queste regole:

REGOLE DI MERGE:
- Per campi stringa: usa il valore non-null più completo/descrittivo
- Per array: unisci eliminando duplicati, mantieni tutti i valori unici
- Per numeri: usa il valore presente, in caso di conflitto usa il più conservativo (es. dose minima più bassa, dose massima più alta)
- Per dosaggi_dettagliati: unisci tutte le voci, elimina duplicati esatti, mantieni variazioni legittime (stessa coltura ma dosi diverse per epoche diverse)
- Per resistenze: unisci tutte le voci, elimina duplicati esatti basati sul testo_completo o sulla combinazione di prodotti_da_evitare e colture_interessate
- extraction_confidence: usa la media dei valori
- extracted_fields: unisci tutti i campi estratti
- errors: unisci tutti gli errori

OGGETTI PARZIALI DA UNIRE:
{partials}

{format_instructions}

Rispondi SOLO con il JSON unificato, senza testo aggiuntivo.
`);
  const chain = prompt.pipe(llm).pipe(parser);
  const result = await chain.invoke(
    {
      partials: JSON.stringify(partials, null, 2),
      format_instructions: parser.getFormatInstructions(),
    },
    { callbacks: tracker.callbacks },
  );
  await usageLogger.logFromAccumulator(tracker.accumulator, {
    userId: context?.userId,
    companyId: context?.companyId,
    jobId: context?.jobId,
    jobGroupId: context?.jobGroupId,
    jobType: context?.jobType ?? LlmJobType.LABEL,
    model: modelForMerge,
    metadata: { step: 'merge-partials', partialsCount: partials.length },
  });
  return sanitizeLabel(result);
}

export async function extractStructuredTreatmentData(
  text: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
): Promise<Label> {
  const inputText = text || '';
  const estimatedTokens = estimateTokens(inputText);
  const maxSafeTokensForMultiChunk = 60000;
  const maxSafeTokensForSingleChunk = 7500;
  const maxChunkSize = 10000;
  const chunkOverlap = 2000;
  const useGpt4oThreshold = 5000;
  const sectionSplitTokenThreshold = 4000;
  const sectionChunkCharLimit = 12000;
  const inputMessage = `Input: ${inputText.length} chars (~${estimatedTokens} tokens estimated)`;
  console.log(`[LABEL_EXTRACTION] ${inputMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: inputMessage,
      metadata: { chars: inputText.length, estimatedTokens },
    });
  }

  if (estimatedTokens <= maxSafeTokensForSingleChunk) {
    if (estimatedTokens > sectionSplitTokenThreshold) {
      const sectionMessage = `Single chunk would be large (${estimatedTokens} tokens). Splitting by sections for safer extraction.`;
      console.log(`[LABEL_EXTRACTION] ${sectionMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logLabelExtraction({
          jobId: context.jobId,
          userId: context.userId,
          message: sectionMessage,
          metadata: { estimatedTokens },
        });
      }

      return await extractBySections(inputText, sectionChunkCharLimit, callbacks, context);
    }
    const modelToUse = estimatedTokens >= useGpt4oThreshold ? 'gpt-4o' : 'gpt-4o-mini';
    const singleChunkMessage = `Single chunk processing with ${modelToUse} (within ${maxSafeTokensForSingleChunk} token safe limit)`;
    console.log(`[LABEL_EXTRACTION] ${singleChunkMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: singleChunkMessage,
        metadata: { model: modelToUse, estimatedTokens },
      });
    }

    return await extractSingleChunk(inputText, modelToUse, callbacks, context);
  }
  if (estimatedTokens > maxSafeTokensForMultiChunk) {
    const errorMessage = `Text too long (${estimatedTokens} tokens > ${maxSafeTokensForMultiChunk}). Consider processing smaller documents.`;
    console.error(`[LABEL_EXTRACTION] ${errorMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logError({
        jobId: context.jobId,
        userId: context.userId,
        message: errorMessage,
        metadata: { estimatedTokens, maxSafeTokensForMultiChunk },
      });
    }
  }
  const chunks = splitTextIntoChunks(inputText, maxChunkSize, chunkOverlap);
  const chunksMessage = `Split into ${chunks.length} chunks for PARALLEL processing with gpt-4o (complex extraction)`;
  console.log(`[LABEL_EXTRACTION] ${chunksMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: chunksMessage,
      metadata: { chunksCount: chunks.length, model: 'gpt-4o' },
    });
  }

  const startTime = Date.now();
  const partialLabels: Label[] = await Promise.all(
    chunks.map((chunk, index) => {
      const chunkMessage = `Starting chunk ${index + 1}/${chunks.length} with gpt-4o`;
      console.log(`[LABEL_EXTRACTION] ${chunkMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logLabelExtraction({
          jobId: context.jobId,
          userId: context.userId,
          message: chunkMessage,
          metadata: { chunkIndex: index + 1, totalChunks: chunks.length },
        });
      }

      return extractSingleChunk(chunk, 'gpt-4o', callbacks, context);
    }),
  );
  const extractionTime = Date.now() - startTime;
  const extractedMessage = `Extracted ${partialLabels.length} chunks in ${extractionTime}ms (parallel)`;
  console.log(`[LABEL_EXTRACTION] ${extractedMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: extractedMessage,
      metadata: { chunksCount: partialLabels.length, duration: extractionTime },
    });
  }

  return await mergePartialLabels(partialLabels, callbacks, context);
}

async function extractBySections(
  text: string,
  sectionCharLimit: number,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
): Promise<Label> {
  const sections = splitTextIntoSections(text);
  const chunks = buildSectionChunks(sections, sectionCharLimit);
  const sectionsMessage = `Split document into ${sections.length} sections -> ${chunks.length} logical chunks`;
  console.log(`[LABEL_EXTRACTION] ${sectionsMessage}`);

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: sectionsMessage,
      metadata: { sectionsCount: sections.length, chunksCount: chunks.length },
    });
  }

  const partialLabels: Label[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const chunkMessage = `Extracting logical chunk ${i + 1}/${chunks.length} with gpt-4o`;
    console.log(`[LABEL_EXTRACTION] ${chunkMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: chunkMessage,
        metadata: { chunkIndex: i + 1, totalChunks: chunks.length },
      });
    }

    const label = await extractSingleChunk(chunks[i], 'gpt-4o', callbacks, context);
    partialLabels.push(label);
  }
  return await mergePartialLabels(partialLabels, callbacks, context);
}

async function extractSingleChunk(
  text: string,
  modelName: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
  context?: DosageAgentContext,
  retryAttempt: number = 0,
): Promise<Label> {
  const maxRetries = 2;
  try {
    const effectiveModel = process.env.OPENAI_MODEL || modelName;
    const modelMessage = `Using model: ${effectiveModel}`;
    console.log(`[LABEL_EXTRACTION] ${modelMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: modelMessage,
        metadata: { model: effectiveModel },
      });
    }
    const { model: llm } = createChatModel({
      modelName: effectiveModel,
      temperature: 0.1,
      maxTokens: 16000,
    });
    const tracker = usageLogger.createTracker(callbacks);
    const parser = new JsonOutputParser<Label>();
    const prompt = PromptTemplate.fromTemplate(`
  Sei un esperto nell'estrazione di dati da etichette di prodotti fitosanitari italiani.
Analizza il seguente testo estratto da un'etichetta PDF e estrai le informazioni strutturate seguendo lo SCHEMA richiesto.

REGOLA FONDAMENTALE: DEVI ESTRARRE TUTTE LE COLTURE E TUTTI I DOSAGGI PRESENTI NELL'ETICHETTA.
NON fermarti prima di aver completato l'intero documento. L'etichetta può contenere 40+ colture diverse: ESTRAILE TUTTE.

LINEE GUIDA:
- Estrai solo informazioni chiaramente presenti nel testo; se assenti usa null o []. Evita duplicati nelle liste.
- Non inferire valori. Mantieni le unità così come in etichetta quando possibile.
- Correggi refusi comuni nei nomi (es. "Salsefrica" → "Salsefrica").
- **CRITICO**: Individua TUTTI i dosaggi possibili del prodotto per TUTTE le colture menzionate. I dosaggi possono essere espressi in varie unità di misura di solidi o liquidi (es. L/ha, gr/hl, gr, l, etc).
- Se una dose viene attribuita a più colture (es. "soia, mais, girasole, sorgo"), crea una VOCE SEPARATA per ciascuna coltura con gli stessi parametri (dose, acqua, ecc.), senza aggregare più colture nella stessa voce di dosaggio.
- Se il testo descrive più scopi distinti per la stessa coltura (es. "Disseccante", "Diserbante", "Dissecante fogliare pre-raccolta", "Spollonante e diserbante"), crea VOCI DISTINTE in dosaggi_dettagliati per ciascuno scopo. Non combinare scopi diversi in un'unica voce. Riporta lo scopo nel campo istruzioni (es. "Disseccante: applicare...").
- IMPORTANTE EPOCHE DIVERSE: Se la stessa coltura ha dosaggi diversi per epoche fenologiche diverse (es. "Soia post-emergenza: 1-2 L/ha" e "Soia fioritura: 0.2-0.4 L/ha"), crea VOCI SEPARATE con i dosaggi specifici di ogni epoca. Valorizza sempre il campo epoca_impiego per distinguere le voci (es. "post-emergenza", "fioritura", "pre-fioritura", "allegagione", ecc.).
- **COMPLETEZZA OBBLIGATORIA**: Scansiona sistematicamente TUTTE le sezioni di "MODALITÀ E DOSI D'IMPIEGO" e genera una voce per OGNI SINGOLA coltura per cui sia indicata una dose/misura. Non tralasciare NESSUNA coltura presente con dosi. Anche se ci sono 40, 50, 60 colture: ESTRAILE TUTTE.
- Unifica categorie generiche (es. "Floreali e ornamentali (inclusi alberi e arbusti)") se deducibile dal testo.
- Se presente, estrai la FORMULAZIONE (es. "SC (sospensione concentrata)") separata dalla categoria.

VALIDAZIONI:
- dosaggi_dettagliati: crea UNA VOCE per ogni combinazione DOSE x COLTURA x EPOCA x SCOPO; includi quando possibile: dose_minima (numero minimo del range), dose_massima (numero massimo del range), dose_um (stringa, es. "L/ha", "kg/ha", "g/hl"), acqua_max (numero), acqua_max_um (stringa), malattia. IMPORTANTE: Se l'etichetta specifica un range (es. "1-3 kg/ha" o "1 kg/ha - 3 kg/ha"), estrai dose_minima=1 e dose_massima=3. Se c'è un solo valore (es. "2 kg/ha"), usa lo stesso valore per entrambi (dose_minima=2, dose_massima=2). Se presenti, aggiungi n_max_applicazioni (numero) e n_max_applicazioni_um (stringa, es. "per anno", "per ciclo"); se assenti NON inserirli. Includi inoltre: intervallo_min_giorni (numero), intervallo_sicurezza_giorni (numero o null), epoca_impiego (testo breve con sigle BBCH se presenti, es. "post-emergenza", "fioritura", "pre-fioritura"), modalita_applicazione (descrizione DETTAGLIATA delle condizioni, tempistiche e metodologia di applicazione del prodotto - estrai il testo completo dalla sezione "DOSI E MODALITÀ D'IMPIEGO" o simili che spiega COME e QUANDO usare il prodotto, es. "Il prodotto si impiega in presenza delle condizioni predisponenti la malattia, dopo la prima pioggia infettante. Per i trattamenti successivi l'attività sistemica del prodotto permetterà di mantenere delle cadenze fisse sganciate dalle piogge..."), istruzioni (testo breve sintetico specifico per la coltura, es. "Trattamenti a intervalli di 12-14 giorni"). NON aggregare più colture nella stessa voce. Se la stessa coltura ha dosaggi diversi per epoche diverse, crea più voci separate.
- fasce_di_rispetto_e_deriva: elenca righe sintetiche con metri o % riduzione deriva quando presenti.
- fasce_rispetto_acqua: estrai SPECIFICAMENTE le fasce di rispetto da CORSI D'ACQUA (fiumi, canali, fossi, laghi, torrenti, acque superficiali). Cerca frasi come "fascia di rispetto di X metri dai corsi d'acqua", "zona non trattata di X m dai corpi idrici", "distanza da canali/fossi". Riporta la frase completa che descrive la fascia. Se non presente, usa null.
- fasce_rispetto_colture: estrai SPECIFICAMENTE le fasce di rispetto da ALTRE COLTURE (colture adiacenti, limitrofe, sensibili, confinanti). Cerca frasi come "fascia di rispetto di X metri da colture adiacenti", "zona non trattata verso colture sensibili". Riporta la frase completa che descrive la fascia. Se non presente, usa null.
- frasi_pericolo e frasi_prudenza: estrai codici e TESTO completo se presente (es. "EUH208: <testo>").
- compatibilita/fitotossicita/note_tecniche: estrai come stringa.
- Se il testo non contiene una descrizione tecnica, imposta note_tecniche a una breve descrizione generica coerente se l'etichetta lo suggerisce (es. "Fungicida a base di zolfo per il controllo dell'oidio").
- colture_target_fuori_periodo_di_prodizione: se nel testo è presente una frase come "TERRENI IN ASSENZA DI COLTURE e destinati alla coltivazione di: " o simili che indicano applicazioni su terreni senza colture in produzione, estrai l'elenco delle colture specificate come array di stringhe. Se questa informazione non è presente nel testo, imposta il campo a null.
- resistenze: estrai tutte le informazioni relative alla gestione delle resistenze. Cerca sezioni che contengono titoli/frasi come "PREVENZIONE E GESTIONE DELLA RESISTENZA", "per evitare l'insorgenza di resistenza", "può dar luogo a fenomeni di resistenza", "resistenze", "malerbe resistenti", "non applicare", "non utilizzare", "alternare con", "alternare all'erbicida", ecc. IMPORTANTE: anche se non ci sono prodotti specifici da evitare o numeri di applicazioni, se il testo contiene informazioni generiche sulla gestione delle resistenze (es. raccomandazioni su alternanza, rotazione colturale, falsa semina, monitoraggio), crea comunque un oggetto resistenza. Per ogni avvertimento/resistenza trovato, crea un oggetto con: prodotti_da_evitare (array di nomi di prodotti o principi attivi da evitare - può essere null se non specificato), famiglie_chimiche_da_evitare (array di famiglie chimiche, es. "carbossianilidi", "strobilurine" - può essere null se non specificato), n_min_applicazioni e n_max_applicazioni (numeri minimo e massimo di applicazioni consentite - IMPORTANTE: se l'etichetta specifica un range come "1-2" o "2-3", estrai n_min_applicazioni=1 e n_max_applicazioni=2, oppure n_min_applicazioni=2 e n_max_applicazioni=3 rispettivamente; se c'è un solo valore come "3", usa lo stesso valore per entrambi n_min_applicazioni=3 e n_max_applicazioni=3; può essere null se non specificato), n_max_applicazioni_um (stringa con unità di misura, es. "per anno", "per ciclo" - può essere null se non specificato), periodo_tempo (stringa che indica il periodo, es. "nell'arco dell'anno", "per ciclo" - può essere null se non specificato), colture_interessate (array di colture o target a cui si applica l'avvertimento, es. ["malerbe"] se menzionato - può essere null se non specificato), raccomandazioni (testo con suggerimenti per alternare con altri prodotti, pratiche agronomiche come rotazione colturale, falsa semina, monitoraggio, ecc. - estrai tutto il testo rilevante), testo_completo (testo completo della sezione resistenza per riferimento). Se non ci sono informazioni sulle resistenze, imposta il campo a array vuoto [].

CAMPi CHIAVE PER LA CONFIDENZA:
- prodotto, categoria, principio_attivo, composizione, malattie, specie, dosaggi_dettagliati.

SCHEMA JSON RICHIESTO:
{{
"prodotto": "string o null",
"categoria": "string o null",
"formulazione": "string o null",
"principio_attivo": "string o null",
"composizione": "string o null",
"meccanismo_azione_frac": "string o null",
"malattie": ["string"],
"specie": ["string"],
"colture_target": ["string"],
"colture_target_fuori_periodo_di_prodizione": ["string"] o null,
"dosaggi_dettagliati": [
{{
"coltura": "string",
"malattia": "string o null",
"dose_minima": number o null,
"dose_massima": number o null,
"dose_um": "string o null",
"acqua_max": number o null,
"acqua_max_um": "string o null",
"n_max_applicazioni": number,
"n_max_applicazioni_um": "string",
"intervallo_min_giorni": number o null,
"intervallo_sicurezza_giorni": number o null,
"epoca_impiego": "string o null",
"modalita_applicazione": "string o null",
"istruzioni": "string o null"
}}
],
"fasce_di_rispetto_e_deriva": ["string"],
"fasce_rispetto_acqua": "string o null",
"fasce_rispetto_colture": "string o null",
"avvertenze": ["string"],
"frasi_pericolo": ["string"],
"frasi_prudenza": ["string"],
"compatibilita": "string o null",
"fitotossicita": "string o null",
"note_tecniche": "string o null",
"numero_registrazione": "string o null",
"titolare": "string o null",
"stabilimento": "string o null",
"caratteristiche": "string o null",
"resistenze": [
{{
"prodotti_da_evitare": ["string"] o null,
"famiglie_chimiche_da_evitare": ["string"] o null,
"n_min_applicazioni": number o null,
"n_max_applicazioni": number o null,
"n_max_applicazioni_um": "string o null",
"periodo_tempo": "string o null",
"colture_interessate": ["string"] o null,
"raccomandazioni": "string o null",
"testo_completo": "string o null"
}}
],
"extraction_confidence": number (0-100),
"extracted_fields": ["string"],
"errors": ["string"]
}}

TESTO DA ANALIZZARE:
{text}

{format_instructions}

Rispondi SOLO con il JSON nello schema esatto sopra, senza testo aggiuntivo.
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
    const extractedMessage = `Extracted ${dosaggiCount} dosaggio entries`;
    console.log(`[LABEL_EXTRACTION] ${extractedMessage}`);

    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: extractedMessage,
        metadata: { dosaggiCount },
      });
    }

    if (dosaggiCount < 5) {
      const warningMessage = `WARNING: Only ${dosaggiCount} dosaggi extracted - output might be incomplete!`;
      console.warn(`[LABEL_EXTRACTION] ${warningMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logWarning({
          jobId: context.jobId,
          userId: context.userId,
          message: warningMessage,
          metadata: { dosaggiCount },
        });
      }
    }
    await usageLogger.logFromAccumulator(tracker.accumulator, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.LABEL,
      model: effectiveModel,
      metadata: { step: 'label-chunk', chunkLength: text.length },
    });
    return sanitized;
  } catch (err) {
    const errName = err instanceof Error ? err.name : 'UnknownError';
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    const errorMessage = `Error in chunk extraction [${errName}]: ${errMsg}`;
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
      const retryMessage = `Retrying chunk extraction (attempt ${retryAttempt + 2}/${maxRetries + 1}) with concise prompt`;
      console.log(`[LABEL_EXTRACTION] ${retryMessage}`);

      if (hasContext(context)) {
        const logger = DosageLoggerService.getInstance();
        logger.logWarning({
          jobId: context.jobId,
          userId: context.userId,
          message: retryMessage,
          metadata: { retryAttempt: retryAttempt + 1, maxRetries },
        });
      }

      return extractSingleChunkConcise(text, modelName, callbacks, context, retryAttempt + 1);
    }

    throw new LabelExtractionError(
      `Label extraction failed after ${retryAttempt + 1} attempt(s): [${errName}] ${errMsg}`,
      err instanceof Error ? err : undefined,
    );
  }
}

/**
 * Retry extraction with a more concise prompt to avoid JSON truncation.
 * Used when the first attempt fails due to JSON parsing errors.
 */
async function extractSingleChunkConcise(
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

const LABEL_EXTRACTION_MODEL = resolveLabelExtractionModelName();

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

export async function extractStructuredTreatmentDataWithLlm(
  text: string,
  context?: DosageAgentContext,
): Promise<Label> {
  if (!hasChatLlmApiKey()) {
    throw new Error('OPENROUTER_API_KEY is required');
  }
  const inputText = text || '';
  const modelName = LABEL_EXTRACTION_MODEL;
  const inputMessage = `[LABEL_EXTRACTION] Input: ${inputText.length} chars`;
  console.log(inputMessage);
  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logLabelExtraction({
      jobId: context.jobId,
      userId: context.userId,
      message: inputMessage,
      metadata: { chars: inputText.length, model: modelName },
    });
  }
  const prompt = buildMistralExtractionPrompt(inputText);
  try {
    const response = await fetchChatCompletion({
      model: modelName,
      messages: [
        {
          role: 'system',
          content:
            "Sei un esperto nell'estrazione di dati da etichette di prodotti fitosanitari italiani. Rispondi SOLO con JSON valido senza testo aggiuntivo.",
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.1,
      maxTokens: 16000,
      responseFormat: { type: 'json_object' },
    });
    const parsedResponse = await parseChatCompletionResponse(response);
    const rawContent = parsedResponse.content;
    if (!rawContent) {
      console.error('[LABEL_EXTRACTION] Empty response from LLM');
      return sanitizeLabel({});
    }
    const parsed = JSON.parse(rawContent) as unknown;
    const sanitized = sanitizeLabel(parsed);
    const dosaggiCount = Array.isArray(sanitized.dosaggi_dettagliati)
      ? sanitized.dosaggi_dettagliati.length
      : 0;
    const extractedMessage = `[LABEL_EXTRACTION] Extracted ${dosaggiCount} dosaggio entries`;
    console.log(extractedMessage);
    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logLabelExtraction({
        jobId: context.jobId,
        userId: context.userId,
        message: extractedMessage,
        metadata: { dosaggiCount, model: modelName },
      });
    }
    const usageRaw = parsedResponse.usage;
    const promptTokens =
      Number(
        usageRaw?.['prompt_tokens'] ??
          usageRaw?.['promptTokens'] ??
          usageRaw?.['input_tokens'] ??
          0,
      ) || 0;
    const completionTokens =
      Number(
        usageRaw?.['completion_tokens'] ??
          usageRaw?.['completionTokens'] ??
          usageRaw?.['output_tokens'] ??
          0,
      ) || 0;
    const totalTokensCandidate =
      Number(
        usageRaw?.['total_tokens'] ?? usageRaw?.['totalTokens'] ?? promptTokens + completionTokens,
      ) || 0;
    const totalTokens = totalTokensCandidate > 0 ? totalTokensCandidate : estimateTokens(inputText);
    const promptTokensDetails = usageRaw?.['prompt_tokens_details'] as
      | { cached_tokens?: number }
      | undefined;
    const cachedPromptTokens =
      Number(
        promptTokensDetails?.cached_tokens ??
          usageRaw?.['cached_tokens'] ??
          usageRaw?.['cache_read_input_tokens'] ??
          0,
      ) || 0;
    const tokens: TokenUsage = {
      promptTokens,
      completionTokens,
      totalTokens,
      cachedPromptTokens,
    };
    await usageLogger.logFromUsage(tokens, {
      userId: context?.userId,
      companyId: context?.companyId,
      jobId: context?.jobId,
      jobGroupId: context?.jobGroupId,
      jobType: context?.jobType ?? LlmJobType.LABEL,
      model: modelName,
      metadata: { step: 'label-extraction', responseLength: rawContent.length },
      margin: 0.3,
    });
    return sanitized;
  } catch (err) {
    const errorMessage = `[LABEL_EXTRACTION] Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(errorMessage);
    if (hasContext(context)) {
      const logger = DosageLoggerService.getInstance();
      logger.logError({
        jobId: context.jobId,
        userId: context.userId,
        message: errorMessage,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
    return sanitizeLabel({});
  }
}

function buildMistralExtractionPrompt(text: string): string {
  return `Analizza il seguente testo estratto da un'etichetta PDF e estrai le informazioni strutturate seguendo lo SCHEMA richiesto.

REGOLA FONDAMENTALE: DEVI ESTRARRE TUTTE LE COLTURE E TUTTI I DOSAGGI PRESENTI NELL'ETICHETTA.
NON fermarti prima di aver completato l'intero documento. L'etichetta può contenere 40+ colture diverse: ESTRAILE TUTTE.

LINEE GUIDA:
- Estrai solo informazioni chiaramente presenti nel testo; se assenti usa null o []. Evita duplicati nelle liste.
- Non inferire valori. Mantieni le unità così come in etichetta quando possibile.
- Correggi refusi comuni nei nomi (es. "Salsefrica" → "Salsefrica").
- **CRITICO**: Individua TUTTI i dosaggi possibili del prodotto per TUTTE le colture menzionate. I dosaggi possono essere espressi in varie unità di misura di solidi o liquidi (es. L/ha, gr/hl, gr, l, etc).
- Se una dose viene attribuita a più colture (es. "soia, mais, girasole, sorgo"), crea una VOCE SEPARATA per ciascuna coltura con gli stessi parametri (dose, acqua, ecc.), senza aggregare più colture nella stessa voce di dosaggio.
- Se il testo descrive più scopi distinti per la stessa coltura (es. "Disseccante", "Diserbante", "Dissecante fogliare pre-raccolta", "Spollonante e diserbante"), crea VOCI DISTINTE in dosaggi_dettagliati per ciascuno scopo. Non combinare scopi diversi in un'unica voce. Riporta lo scopo nel campo istruzioni (es. "Disseccante: applicare...").
- IMPORTANTE EPOCHE DIVERSE: Se la stessa coltura ha dosaggi diversi per epoche fenologiche diverse (es. "Soia post-emergenza: 1-2 L/ha" e "Soia fioritura: 0.2-0.4 L/ha"), crea VOCI SEPARATE con i dosaggi specifici di ogni epoca. Valorizza sempre il campo epoca_impiego per distinguere le voci (es. "post-emergenza", "fioritura", "pre-fioritura", "allegagione", ecc.).
- **COMPLETEZZA OBBLIGATORIA**: Scansiona sistematicamente TUTTE le sezioni di "MODALITÀ E DOSI D'IMPIEGO" e genera una voce per OGNI SINGOLA coltura per cui sia indicata una dose/misura. Non tralasciare NESSUNA coltura presente con dosi. Anche se ci sono 40, 50, 60 colture: ESTRAILE TUTTE.
- Unifica categorie generiche (es. "Floreali e ornamentali (inclusi alberi e arbusti)") se deducibile dal testo.
- Se presente, estrai la FORMULAZIONE (es. "SC (sospensione concentrata)") separata dalla categoria.

VALIDAZIONI:
- dosaggi_dettagliati: crea UNA VOCE per ogni combinazione DOSE x COLTURA x EPOCA x SCOPO; includi quando possibile: dose_minima (numero minimo del range), dose_massima (numero massimo del range), dose_um (stringa, es. "L/ha", "kg/ha", "g/hl"), acqua_max (numero), acqua_max_um (stringa), malattia. IMPORTANTE: Se l'etichetta specifica un range (es. "1-3 kg/ha" o "1 kg/ha - 3 kg/ha"), estrai dose_minima=1 e dose_massima=3. Se c'è un solo valore (es. "2 kg/ha"), usa lo stesso valore per entrambi (dose_minima=2, dose_massima=2). Se presenti, aggiungi n_max_applicazioni (numero) e n_max_applicazioni_um (stringa, es. "per anno", "per ciclo"); se assenti NON inserirli. Includi inoltre: intervallo_min_giorni (numero), intervallo_sicurezza_giorni (numero o null), epoca_impiego (testo breve con sigle BBCH se presenti, es. "post-emergenza", "fioritura", "pre-fioritura"), modalita_applicazione (descrizione DETTAGLIATA delle condizioni, tempistiche e metodologia di applicazione del prodotto - estrai il testo completo dalla sezione "DOSI E MODALITÀ D'IMPIEGO" o simili che spiega COME e QUANDO usare il prodotto, es. "Il prodotto si impiega in presenza delle condizioni predisponenti la malattia, dopo la prima pioggia infettante. Per i trattamenti successivi l'attività sistemica del prodotto permetterà di mantenere delle cadenze fisse sganciate dalle piogge..."), istruzioni (testo breve sintetico specifico per la coltura, es. "Trattamenti a intervalli di 12-14 giorni"). NON aggregare più colture nella stessa voce. Se la stessa coltura ha dosaggi diversi per epoche diverse, crea più voci separate.
- fasce_di_rispetto_e_deriva: elenca righe sintetiche con metri o % riduzione deriva quando presenti.
- fasce_rispetto_acqua: estrai SPECIFICAMENTE le fasce di rispetto da CORSI D'ACQUA (fiumi, canali, fossi, laghi, torrenti, acque superficiali). Cerca frasi come "fascia di rispetto di X metri dai corsi d'acqua", "zona non trattata di X m dai corpi idrici", "distanza da canali/fossi". Riporta la frase completa che descrive la fascia. Se non presente, usa null.
- fasce_rispetto_colture: estrai SPECIFICAMENTE le fasce di rispetto da ALTRE COLTURE (colture adiacenti, limitrofe, sensibili, confinanti). Cerca frasi come "fascia di rispetto di X metri da colture adiacenti", "zona non trattata verso colture sensibili". Riporta la frase completa che descrive la fascia. Se non presente, usa null.
- frasi_pericolo e frasi_prudenza: estrai codici e TESTO completo se presente (es. "EUH208: <testo>").
- compatibilita/fitotossicita/note_tecniche: estrai come stringa.
- Se il testo non contiene una descrizione tecnica, imposta note_tecniche a una breve descrizione generica coerente se l'etichetta lo suggerisce (es. "Fungicida a base di zolfo per il controllo dell'oidio").
- colture_target_fuori_periodo_di_prodizione: se nel testo è presente una frase come "TERRENI IN ASSENZA DI COLTURE e destinati alla coltivazione di: " o simili che indicano applicazioni su terreni senza colture in produzione, estrai l'elenco delle colture specificate come array di stringhe. Se questa informazione non è presente nel testo, imposta il campo a null.
- resistenze: estrai tutte le informazioni relative alla gestione delle resistenze. Cerca sezioni che contengono titoli/frasi come "PREVENZIONE E GESTIONE DELLA RESISTENZA", "per evitare l'insorgenza di resistenza", "può dar luogo a fenomeni di resistenza", "resistenze", "malerbe resistenti", "non applicare", "non utilizzare", "alternare con", "alternare all'erbicida", ecc. IMPORTANTE: anche se non ci sono prodotti specifici da evitare o numeri di applicazioni, se il testo contiene informazioni generiche sulla gestione delle resistenze (es. raccomandazioni su alternanza, rotazione colturale, falsa semina, monitoraggio), crea comunque un oggetto resistenza. Per ogni avvertimento/resistenza trovato, crea un oggetto con: prodotti_da_evitare (array di nomi di prodotti o principi attivi da evitare - può essere null se non specificato), famiglie_chimiche_da_evitare (array di famiglie chimiche, es. "carbossianilidi", "strobilurine" - può essere null se non specificato), n_min_applicazioni e n_max_applicazioni (numeri minimo e massimo di applicazioni consentite - IMPORTANTE: se l'etichetta specifica un range come "1-2" o "2-3", estrai n_min_applicazioni=1 e n_max_applicazioni=2, oppure n_min_applicazioni=2 e n_max_applicazioni=3 rispettivamente; se c'è un solo valore come "3", usa lo stesso valore per entrambi n_min_applicazioni=3 e n_max_applicazioni=3; può essere null se non specificato), n_max_applicazioni_um (stringa con unità di misura, es. "per anno", "per ciclo" - può essere null se non specificato), periodo_tempo (stringa che indica il periodo, es. "nell'arco dell'anno", "per ciclo" - può essere null se non specificato), colture_interessate (array di colture o target a cui si applica l'avvertimento, es. ["malerbe"] se menzionato - può essere null se non specificato), raccomandazioni (testo con suggerimenti per alternare con altri prodotti, pratiche agronomiche come rotazione colturale, falsa semina, monitoraggio, ecc. - estrai tutto il testo rilevante), testo_completo (testo completo della sezione resistenza per riferimento). Se non ci sono informazioni sulle resistenze, imposta il campo a array vuoto [].

CAMPi CHIAVE PER LA CONFIDENZA:
- prodotto, categoria, principio_attivo, composizione, malattie, specie, dosaggi_dettagliati.

SCHEMA JSON RICHIESTO:
{
"prodotto": "string o null",
"categoria": "string o null",
"formulazione": "string o null",
"principio_attivo": "string o null",
"composizione": "string o null",
"meccanismo_azione_frac": "string o null",
"malattie": ["string"],
"specie": ["string"],
"colture_target": ["string"],
"colture_target_fuori_periodo_di_prodizione": ["string"] o null,
"dosaggi_dettagliati": [
{
"coltura": "string",
"malattia": "string o null",
"dose_minima": number o null,
"dose_massima": number o null,
"dose_um": "string o null",
"acqua_max": number o null,
"acqua_max_um": "string o null",
"n_max_applicazioni": number,
"n_max_applicazioni_um": "string",
"intervallo_min_giorni": number o null,
"intervallo_sicurezza_giorni": number o null,
"epoca_impiego": "string o null",
"modalita_applicazione": "string o null",
"istruzioni": "string o null"
}
],
"fasce_di_rispetto_e_deriva": ["string"],
"fasce_rispetto_acqua": "string o null",
"fasce_rispetto_colture": "string o null",
"avvertenze": ["string"],
"frasi_pericolo": ["string"],
"frasi_prudenza": ["string"],
"compatibilita": "string o null",
"fitotossicita": "string o null",
"note_tecniche": "string o null",
"numero_registrazione": "string o null",
"titolare": "string o null",
"stabilimento": "string o null",
"caratteristiche": "string o null",
"resistenze": [
{
"prodotti_da_evitare": ["string"] o null,
"famiglie_chimiche_da_evitare": ["string"] o null,
"n_min_applicazioni": number o null,
"n_max_applicazioni": number o null,
"n_max_applicazioni_um": "string o null",
"periodo_tempo": "string o null",
"colture_interessate": ["string"] o null,
"raccomandazioni": "string o null",
"testo_completo": "string o null"
}
],
"extraction_confidence": number (0-100),
"extracted_fields": ["string"],
"errors": ["string"]
}

TESTO DA ANALIZZARE:
${text}

Rispondi SOLO con il JSON nello schema esatto sopra, senza testo aggiuntivo.`;
}
