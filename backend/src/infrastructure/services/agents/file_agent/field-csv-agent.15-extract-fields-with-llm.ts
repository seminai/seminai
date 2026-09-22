import { invokeLLMWithRetry } from './utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, FieldOutputSchema, ExtractedFieldData } from './field_csv_agent.support';
import type { FieldCsvAgentContext } from './field-csv-agent.context';

export async function fieldCsvAgentExtractFieldsWithLLM(this: FieldCsvAgentContext, csvContent: string): Promise<ExtractedFieldData> {
    const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      throw new Error('CSV troppo corto per estrarre fields');
    }

    // Take header + first 50 rows for LLM analysis
    const sampleLines = lines.slice(0, Math.min(51, lines.length));
    const sampleContent = sampleLines.join('\n');

    console.log('FieldCsvAgent: Using LLM for full field extraction');

    const fieldUsageAccumulator = new UsageAccumulator();
    const fieldUsageCollector = new LangChainUsageCollector(fieldUsageAccumulator);
    const extractor = this.getModel().withStructuredOutput(FieldOutputSchema);

    const llmMessages = [
      {
        role: 'system' as const,
        content: `Sei un esperto di dati agricoli italiani. Analizza il CSV e estrai i dati dei campi agricoli (fields).

OBIETTIVO: Estrarre tutti i campi agricoli dal CSV, aggregandoli per particella catastale (foglio + particella + sezione).

REGOLE:
1. **Aggregazione**: Se più righe hanno lo stesso foglio+particella+sezione, crea UN SOLO field aggregando:
   - Superfici: usa il valore massimo
   - Uso del suolo: combina tutti gli usi (es. "Vite, Pero, Albicocco")
   - Date: usa la prima data inizio e l'ultima data fine

2. **Dati Catastali** (OBBLIGATORI):
   - foglio: Numero foglio catastale (stringa)
   - particella: Numero particella (stringa)
   - sezione: Sezione catastale (può essere null)
   - subalterno: Subalterno (può essere null)

3. **Superfici**:
   - superficieCatastaleMq: Superficie in METRI QUADRI (se il CSV ha ettari, moltiplica per 10000)
   - gisHa: Superficie grafica in ettari (se presente)
   - sauHa: SAU in ettari (se presente)

4. **Ubicazione**:
   - city: Comune (estrai da colonne come "COMUNE", "Comune Descrizione", ecc.)
   - region: Regione (se presente)
   - address: Indirizzo (solo se è un indirizzo reale, NON usare colture come indirizzo)

5. **Uso del suolo**:
   - uso: Combina tutte le colture/usi del suolo per quella particella (es. "Vite, Pero, Albicocco")

6. **Date**:
   - inizioConduzione: Data inizio in formato YYYY-MM-DD (estrai da timestamp se necessario)
   - fineConduzione: Data fine in formato YYYY-MM-DD

7. **Nome field**:
   - name: Crea un nome come "COMUNE - F{foglio} P{particella}" (es. "Ravenna - F83 P8")

IMPORTANTE:
- Aggrega per particella: stesso foglio+particella+sezione = UN SOLO field
- Non usare mai colture come indirizzo (es. "ERBA MEDICA", "SOIA", "VITE" non sono indirizzi)
- Converti tutte le superfici in MQ per superficieCatastaleMq
- Gestisci date con timestamp (es. "2025-01-01 00:00:00.0" → "2025-01-01")`,
      },
      {
        role: 'user' as const,
        content: `Estrai i fields da questo CSV:\n\n${sampleContent}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      llmMessages,
      { callbacks: [fieldUsageCollector] },
      { maxRetries: 2, timeoutMs: 60_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(fieldUsageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'field-csv-full-extraction', rowsSampled: sampleLines.length },
      })
      .catch((err) => console.warn('[FIELD-CSV] Failed to log full extraction usage:', err));

    return result as ExtractedFieldData;
  }
