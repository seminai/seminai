import { BaseCallbackHandler } from '@langchain/core/callbacks/base';
import { type FertilizerLabel } from '../../../domain/dtos/fertilizer-label.dto';
import { createChatModel } from '../llm-model-factory';
import { JsonOutputParser } from '@langchain/core/output_parsers';
import { PromptTemplate } from '@langchain/core/prompts';
import { sanitizeFertilizerLabel } from '../utils/fertilizerLabelSanitizer';
import { buildSectionChunks, mergePartialFertilizerLabels, splitTextIntoSections } from './extractDataFromFertilizerLabel.part-01-section';

export async function extractFertilizerBySections(
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

export async function extractFertilizerSingleChunk(
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
