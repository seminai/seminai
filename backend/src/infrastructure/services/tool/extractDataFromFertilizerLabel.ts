import { createChatModel } from '../llm-model-factory';
import { PromptTemplate } from '@langchain/core/prompts';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';
import { sanitizeFertilizerLabel } from '../utils/fertilizerLabelSanitizer';

interface Section {
  readonly title: string;
  readonly content: string;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

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
    if (content.length > 0) sections.push({ title: currentTitle, content });
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
  if (sections.length === 0) return [];
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
  if (currentChunk.length > 0) chunks.push(currentChunk);
  return chunks;
}

async function mergePartialFertilizerLabels(
  partials: ReadonlyArray<FertilizerLabel>,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
): Promise<FertilizerLabel> {
  const modelForMerge = process.env.OPENAI_MODEL || 'gpt-4o';
  console.log(`[FERTILIZER_EXTRACTION] Merging ${partials.length} partials with ${modelForMerge}`);
  const { model: llm } = createChatModel({
    modelName: modelForMerge,
    temperature: 0,
    maxTokens: 16000,
  });
  const parser = new JsonOutputParser<FertilizerLabel>();
  const prompt = PromptTemplate.fromTemplate(`
Sei un agronomo esperto di fertilizzanti dell'UE.
Unisci i JSON parziali nell'UNICO schema richiesto per il "prodotto_fertilizzante_ue".

REGOLE DI MERGE:
- Campi stringa: conserva il testo più completo/specifico (es. "stato_fisico").
- Array (es. "confezioni_disponibili"): unisci mantenendo ordine logico e rimuovi duplicati.
- composizione_garantita: unisci e completa tutte le analisi (NPK, meso, organici, chimico-fisici).
- istruzioni_uso_agronomiche.dosi_applicazione: mantieni tutte le specifiche per coltura (deduplica solo copie identiche).
- informazioni_sicurezza_clp: unisci tutti i pittogrammi/H/P, deduplica.

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
    callbacks && callbacks.length > 0 ? { callbacks: [...callbacks] } : undefined,
  );
  return sanitizeFertilizerLabel(result);
}

export async function extractStructuredFertilizerData(
  text: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
): Promise<FertilizerLabel> {
  const inputText = text || '';
  const estimatedTokens = estimateTokens(inputText);
  const maxSafeTokensForMultiChunk = 60000;
  const maxSafeTokensForSingleChunk = 7500;
  const maxChunkSize = 15000;
  const chunkOverlap = 2000;
  const useGpt4oThreshold = 5000;
  const sectionSplitTokenThreshold = 3800;
  const sectionChunkCharLimit = 12000;
  console.log(
    `[FERTILIZER_EXTRACTION] Input length ${inputText.length} chars (~${estimatedTokens} tokens)`,
  );
  if (estimatedTokens <= maxSafeTokensForSingleChunk) {
    if (estimatedTokens > sectionSplitTokenThreshold) {
      console.log(
        `[FERTILIZER_EXTRACTION] Single chunk would be large. Splitting by logical sections.`,
      );
      return await extractFertilizerBySections(inputText, sectionChunkCharLimit, callbacks);
    }
    const modelToUse = estimatedTokens >= useGpt4oThreshold ? 'gpt-4o' : 'gpt-4o-mini';
    console.log(
      `[FERTILIZER_EXTRACTION] Processing as single chunk with ${modelToUse} (safe bound ${maxSafeTokensForSingleChunk})`,
    );
    return await extractFertilizerSingleChunk(inputText, modelToUse, callbacks);
  }
  if (estimatedTokens > maxSafeTokensForMultiChunk) {
    console.warn(
      `[FERTILIZER_EXTRACTION] Text too long (${estimatedTokens} tokens). Consider smaller documents.`,
    );
  }
  const chunks = splitTextIntoChunks(inputText, maxChunkSize, chunkOverlap);
  console.log(
    `[FERTILIZER_EXTRACTION] Split into ${chunks.length} chunks for parallel extraction with gpt-4o`,
  );
  const startTime = Date.now();
  const partialLabels = await Promise.all(
    chunks.map((chunk, index) => {
      console.log(
        `[FERTILIZER_EXTRACTION] Extracting chunk ${index + 1}/${chunks.length} with gpt-4o`,
      );
      return extractFertilizerSingleChunk(chunk, 'gpt-4o', callbacks);
    }),
  );
  const elapsed = Date.now() - startTime;
  console.log(
    `[FERTILIZER_EXTRACTION] Completed ${partialLabels.length} chunk(s) in ${elapsed}ms. Merging results.`,
  );
  return await mergePartialFertilizerLabels(partialLabels, callbacks);
}

async function extractFertilizerBySections(
  text: string,
  sectionCharLimit: number,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
): Promise<FertilizerLabel> {
  const sections = splitTextIntoSections(text);
  const chunks = buildSectionChunks(sections, sectionCharLimit);
  console.log(
    `[FERTILIZER_EXTRACTION] Identified ${sections.length} sections -> ${chunks.length} logical chunk(s)`,
  );
  const partialLabels: FertilizerLabel[] = [];
  for (let i = 0; i < chunks.length; i += 1) {
    console.log(
      `[FERTILIZER_EXTRACTION] Extracting logical chunk ${i + 1}/${chunks.length} with gpt-4o`,
    );
    const label = await extractFertilizerSingleChunk(chunks[i], 'gpt-4o', callbacks);
    partialLabels.push(label);
  }
  return await mergePartialFertilizerLabels(partialLabels, callbacks);
}

async function extractFertilizerSingleChunk(
  text: string,
  modelName: string,
  callbacks?: ReadonlyArray<BaseCallbackHandler>,
): Promise<FertilizerLabel> {
  try {
    const effectiveModel = process.env.OPENAI_MODEL || modelName;
    console.log(`[FERTILIZER_EXTRACTION] Using model ${effectiveModel}`);
    const { model: llm } = createChatModel({
      modelName: effectiveModel,
      temperature: 0.1,
      maxTokens: 16000,
    });
    const parser = new JsonOutputParser<FertilizerLabel>();
    const prompt = PromptTemplate.fromTemplate(`
Sei un agronomo specializzato in fertilizzanti disciplinati dal Reg. (UE) 2019/1009.
Analizza il testo estratto dall'etichetta e compila il JSON seguendo fedelmente lo schema obbligatorio.

ISTRUZIONI OPERATIVE:
- Popola SEMPRE il nodo "prodotto_fertilizzante_ue" con le sezioni richieste se trovi informazioni rilevanti.
- Deduci "funzione_categoria_prodotto" (PFC), "stato_fisico" (solido, liquido, etc.) e le confezioni disponibili.
- In "composizione_garantita":
  - Analisi NPK principale.
  - Meso-elementi (CaO, MgO, SO3, Na2O) se presenti.
  - Micronutrienti.
  - Parametri organici (Carbonio organico, Acidi umici/fulvici, etc.) per concimi organo-minerali.
  - Caratteristiche chimico-fisiche (pH, densità, salinità).
- Le istruzioni agronomiche devono descrivere uso previsto, dosi generali e specifiche per coltura, frequenza e stoccaggio.
- Sicurezza CLP: avvertenza, pittogrammi, frasi H/P, note mediche.

SCHEMA JSON RICHIESTO:
{{
"prodotto_fertilizzante_ue": {{
  "identificazione_prodotto": {{
    "nome_commerciale": "string o null",
    "funzione_categoria_prodotto": "string o null",
    "numero_lotto": "string o null",
    "stato_fisico": "string o null",
    "confezioni_disponibili": ["string"],
    "quantita_nominale": {{
      "valore": number o null,
      "unita": "string o null"
    }}
  }},
  "composizione_garantita": {{
    "analisi_principale_NPK_percentuale_peso": {{
      "N_totale": number o null,
      "P2O5_totale": number o null,
      "K2O_totale": number o null
    }},
    "meso_elementi_percentuale_peso": {{
      "CaO_totale": number o null,
      "MgO_totale": number o null,
      "SO3_totale": number o null,
      "Na2O_totale": number o null
    }},
    "forme_azoto": [
      {{"tipo": "string o null", "percentuale": number o null}}
    ],
    "solubilita_fosforo": {{
      "P2O5_solubile_acqua": number o null,
      "P2O5_solubile_citrato_ammonio_neutro": number o null
    }},
    "micronutrienti": [
      {{"elemento": "string o null", "percentuale": number o null, "unita": "string o null"}}
    ],
    "parametri_organici_biologici": {{
       "carbonio_organico_biologico": number o null,
       "acidi_umici_fulvici": number o null,
       "sostanza_organica": number o null
    }},
    "elenco_componenti_sopra_5_percento": [
      {{"ingrediente": "string o null", "CMC": "string o null"}}
    ],
    "caratteristiche_chimico_fisiche": {{
       "pH": number o null,
       "densita_20_gradi": number o null,
       "salinita": number o null
    }}
  }},
  "istruzioni_uso_agronomiche": {{
    "uso_previsto": "string o null",
    "dosi_applicazione": {{
      "generale_kg_per_ettaro": number o null,
      "specifiche_coltura": [
        {{"coltura": "string o null", "dose_kg_ha_min": number o null, "dose_kg_ha_max": number o null, "fase_fenologica": "string o null"}}
      ]
    }},
    "frequenza": "string o null",
    "condizioni_stoccaggio": "string o null"
  }},
  "informazioni_sicurezza_clp": {{
    "avvertenza": "string o null",
    "pittogrammi_pericolo": ["string"],
    "indicazioni_pericolo_H": ["string"],
    "consigli_prudenza_P": ["string"],
    "note_mediche": "string o null"
  }}
}}
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
      callbacks && callbacks.length > 0 ? { callbacks: [...callbacks] } : undefined,
    );
    const sanitized = sanitizeFertilizerLabel(result);
    const cropDoseCount =
      sanitized.prodotto_fertilizzante_ue?.istruzioni_uso_agronomiche?.dosi_applicazione
        ?.specifiche_coltura.length ?? 0;
    console.log(`[FERTILIZER_EXTRACTION] Extracted ${cropDoseCount} crop-specific dosage entries`);
    if (cropDoseCount === 0) {
      console.warn(
        '[FERTILIZER_EXTRACTION] WARNING: Nessuna dose specifica per coltura estratta. Verificare il testo di input.',
      );
    }
    return sanitized;
  } catch (error) {
    console.error('[FERTILIZER_EXTRACTION] Error during chunk extraction:', error);
    return sanitizeFertilizerLabel({});
  }
}
