import { type ParsedRow, invokeLLMWithRetry } from './utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, FieldColumnMappingSchema, FieldColumnMapping } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export async function fieldCsvAgentGetColumnMapping(this: FieldCsvAgentContext, headers: string[], sampleRows: ParsedRow[]): Promise<FieldColumnMapping> {
    const sampleData = sampleRows.slice(0, 5).map((row) => {
      const sample: Record<string, string> = {};
      headers.forEach((h) => {
        if (row[h]) {
          sample[h] = row[h].slice(0, 100); // Truncate long values
        }
      });
      return sample;
    });

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(FieldColumnMappingSchema);

    const messages = [
      {
        role: 'system' as const,
        content: `Sei un esperto di dati agricoli italiani. Analizza le intestazioni CSV e le righe di esempio per identificare il mapping delle colonne.

OBIETTIVO: Mappa ogni colonna al suo significato semantico per l'estrazione di dati catastali dei campi agricoli.

FORMATI CSV COMUNI:

1. **Formato AGEA/Emilia-Romagna**:
   - Colonna "FOGLIO " (con spazio finale) o "FOGLIO": numero foglio catastale
   - Colonna "PARTICELLA": numero particella
   - Colonna "SUBALTERNO": subalterno (può essere vuoto)
   - Colonna "COMUNE": comune (es. "ALFONSINE", "BAGNACAVALLO")
   - Colonna "REGIONE": regione (es. "EMILIA ROMAGNA")
   - Colonna "PROVINCIA": sigla provincia (es. "RA", "FE")
   - Colonna "SUPERFICIE(ha)": superficie in ettari (ATTENZIONE: può avere parentesi e unità nel nome)
   - Colonna "OCCUPAZIONE SUOLO": coltura/uso suolo (es. "ERBA MEDICA", "GRANTURCO (MAIS)")
   - Colonna "DATA INIZIO UTILIZZO": data inizio (formato DD-MM-YYYY)
   - Colonna "DATA FINE UTILIZZO": data fine (formato DD-MM-YYYY)

2. **Formato SATA/SIAN**:
   - Colonna "Foglio": foglio catastale
   - Colonna "Particella": particella
   - Colonna "Sezione": sezione
   - Colonna "Superficie Catastale": superficie in ettari
   - Colonna "Comune Descrizione": comune con provincia (es. "POZZOLO FORMIGARO (AL)")

COLONNE DA IDENTIFICARE:
1. **Identificativi**:
   - unitaProduttiva: Nome azienda/unità (es. "Ragione Sociale", "Azienda", "Unita Produttiva")

2. **Ubicazione**:
   - regione: Regione (es. "REGIONE", "Regione", "EMILIA ROMAGNA")
   - provincia: Provincia (es. "PROVINCIA", "Provincia", "RA", "FE")
   - comune: Comune (es. "COMUNE", "Comune", "Comune Descrizione")
   - cap: CAP
   - indirizzo: Indirizzo

3. **Dati Catastali** (OBBLIGATORI):
   - foglio: Foglio catastale (es. "FOGLIO ", "Foglio", "FGL", "Fgl.") - ATTENZIONE: può avere spazio finale
   - particella: Particella (es. "PARTICELLA", "Particella", "PART", "Part.")
   - sezione: Sezione (es. "Sezione", "SEZ", "Sez.")
   - subalterno: Subalterno (es. "SUBALTERNO", "Subalterno", "SUB", "Sub.")

4. **Superfici**:
   - superficieCatastale: Superficie catastale (es. "SUPERFICIE(ha)", "Superficie Catastale", "Sup. Cat.", "Superficie(ha)")
   - superficieGrafica: Superficie grafica (es. "Superficie Grafica", "Sup. Graf.")
   - sau: SAU (es. "SAU", "Superficie Agricola", "Superficie Agricola Utilizzabile")

5. **Uso del suolo**:
   - usoSuolo: Uso/occupazione suolo (es. "OCCUPAZIONE SUOLO", "Occupazione Suolo", "Uso", "Coltura")
   - qualita: Qualità catastale (es. "QUALITA", "Qualita", "Qualità")

6. **Date**:
   - dataInizio: Data inizio (es. "DATA INIZIO UTILIZZO", "Data Inizio Utilizzo", "Data inizio Semina Primario")
   - dataFine: Data fine (es. "DATA FINE UTILIZZO", "Data Fine Utilizzo", "Data fine Semina Primario")

REGOLE CRITICHE:
- Restituisci il NOME ESATTO della colonna come appare nelle intestazioni (inclusi spazi finali, parentesi, maiuscole/minuscole)
- Se una colonna non esiste, restituisci null
- Foglio e Particella sono OBBLIGATORI - devono essere identificati
- ATTENZIONE: "FOGLIO " (con spazio) è diverso da "FOGLIO" (senza spazio) - usa il nome esatto
- ATTENZIONE: "SUPERFICIE(ha)" può avere parentesi e unità nel nome colonna
- Rileva l'unità di misura delle superfici (HA o MQ) - se la colonna contiene "(ha)" nel nome, è HA
- Rileva il formato delle date (DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, etc.)
- Per il formato Emilia-Romagna, le date sono spesso DD-MM-YYYY (es. "11-11-2024")`,
      },
      {
        role: 'user' as const,
        content: `Headers: ${JSON.stringify(headers)}\n\nSample rows:\n${JSON.stringify(sampleData, null, 2)}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      messages,
      { callbacks: [usageCollector] },
      { maxRetries: 2, timeoutMs: 30_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'field-csv-column-mapping' },
      })
      .catch((err) => console.warn('[FIELD-CSV] Failed to log usage:', err));

    return result as FieldColumnMapping;
  }
