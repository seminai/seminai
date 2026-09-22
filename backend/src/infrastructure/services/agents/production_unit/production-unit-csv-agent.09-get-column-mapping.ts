import { type ParsedRow, invokeLLMWithRetry } from '../file_agent/utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, ColumnMappingSchema, ColumnMapping } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentGetColumnMapping(this: ProductionUnitCsvAgentContext, headers: string[], sampleRows: ParsedRow[]): Promise<ColumnMapping> {
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
    const extractor = this.getModel().withStructuredOutput(ColumnMappingSchema);

    const messages = [
      {
        role: 'system' as const,
        content: `You are an agricultural data expert. Analyze the CSV headers and sample rows to determine:
1. The format: AGEA if a column like "Occupazione Suolo Uso Suolo Primario" exists, otherwise LEGACY.
2. Map each relevant column to its semantic meaning.

For AGEA format, map these PRIMARY cycle columns:
- occupazioneSuoloPrimario: "Occupazione Suolo Uso Suolo Primario" (with codes like [003] COLZA)
- destinazioneUsoPrimario: "Destinazione Uso Suolo Primario"
- varietaUsoSuoloPrimario: "Varieta Uso Suolo Primario"
- superficieUsoSuoloPrimario: "Superficie Uso Suolo Primario"
- superficieNettaUsoSuoloPrimario: "Superficie Netta Uso Suolo Primario"
- tipoSeminaPrimario: "Tipo Semina Primario" (like AUTUNNO-INVERNO)
- dataInizioSeminaPrimario: "Data inizio Semina Primario" (dd/mm/yyyy)
- dataFineSeminaPrimario: "Data fine Semina Primario" (dd/mm/yyyy)

For AGEA format, map these SECONDARY cycle columns (if present):
- occupazioneSuoloSecondario: "Occupazione Suolo Uso Suolo Secondario"
- destinazioneUsoSecondario: "Destinazione Uso Suolo Secondario"
- varietaUsoSuoloSecondario: "Varieta Uso Suolo Secondario"
- superficieUsoSuoloSecondario: "Superficie Uso Suolo Secondario"
- tipoSeminaSecondario: "Tipo Semina Secondario"
- dataInizioSeminaSecondario: "Data inizio Semina Secondario" (dd/mm/yyyy)
- dataFineSeminaSecondario: "Data fine Semina Secondario" (dd/mm/yyyy)

Also map these common AGEA columns:
- unitName: "Unita produttiva"
- Cadastral info: sezione, foglio, particella, subalterno
- Areas: superficieCatastale, superficieGrafica
- Company: conduttore, aziendaCondAsservimento
- comuneDescrizione, rotazioneColturale, idAppezzamentoAgea

For LEGACY format, map these columns:
- cropName: "Coltura primaria", "Coltura", "Crop", "Occupazione", "Prodotto"
- cropType: "Dest. uso", "Destinazione", "Tipo coltura"
- variety: "Varieta", "Varietà"
- fieldName: "Nome campo", "Campo", "Field", "Appezzamento"
- areaHa: "Sup. uso primario", "Superficie uso", "SAU", "Ettari", "Area", "Superficie Netta"
- startDate: "Inizio semina", "Data inizio", "Start date", "Semina"
- endDate: "Fine semina", "Data fine", "End date", "Raccolta"
- sezione: "Sez.", "Sezione"
- foglio: "Fog.", "Foglio"
- particella: "Part.", "Particella"
- subalterno: "Sub", "Sub.", "Subalterno"

IMPORTANT: For area columns, map the USAGE area (like "Sup. uso primario") to "areaHa", NOT the cadastral area.
Return null for any column you cannot identify.`,
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
        metadata: { step: 'production-unit-column-mapping' },
      })
      .catch((err) => console.warn('[PRODUCTION-UNIT-CSV] Failed to log usage:', err));

    return result as ColumnMapping;
  }
