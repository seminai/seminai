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
import { usageLogger } from './extractDataFromLabel.part-01-estimate-tokens';
import { extractSingleChunkConcise } from './extractDataFromLabel.part-04-extract-single-chunk-concise';

export async function extractSingleChunk(
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
