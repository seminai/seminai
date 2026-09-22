import { z } from 'zod';
import { invokeLLMWithRetry } from '../file_agent/utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger, ProductionCycleRaw, ProductionUnitRaw } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentExtractProductionUnitsWithLLM(this: ProductionUnitCsvAgentContext, csvContent: string): Promise<ProductionUnitRaw[]> {
    const lines = csvContent.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length < 2) {
      return [];
    }

    // Take header + first 50 rows for LLM analysis
    const sampleLines = lines.slice(0, Math.min(51, lines.length));
    const sampleContent = sampleLines.join('\n');

    console.log(
      `ProductionUnitCsvAgent: Using full LLM extraction on ${sampleLines.length - 1} sample rows`,
    );

    const LLMProductionUnitSchema = z.object({
      units: z.array(
        z.object({
          name: z.string().describe('Nome unità produttiva (es. "Frumento tenero - Bolero")'),
          cropName: z
            .string()
            .describe('Nome coltura in italiano (es. "Frumento tenero", "Vite", "Melo")'),
          cropType: z
            .string()
            .nullable()
            .describe('Tipo/destinazione coltura (es. "seminativo", "frutticolo")'),
          variety: z.string().nullable().describe('Varietà (es. "Bolero", "Golden Delicious")'),
          startDate: z.string().nullable().describe('Data inizio in formato YYYY-MM-DD'),
          endDate: z.string().nullable().describe('Data fine in formato YYYY-MM-DD'),
          allocations: z.array(
            z.object({
              fieldName: z.string().describe('Nome campo (es. "Comune - F10 P23")'),
              sezione: z.string().nullable().describe('Sezione catastale'),
              foglio: z.string().nullable().describe('Foglio catastale'),
              particella: z.string().nullable().describe('Particella catastale'),
              areaHa: z.number().describe('Superficie in ettari'),
            }),
          ),
        }),
      ),
    });

    const usageAccumulator = new UsageAccumulator();
    const usageCollector = new LangChainUsageCollector(usageAccumulator);
    const extractor = this.getModel().withStructuredOutput(LLMProductionUnitSchema);

    const llmMessages = [
      {
        role: 'system' as const,
        content: `Sei un esperto di dati agricoli italiani. Estrai le unità produttive dal CSV fornito.

OBIETTIVO: Raggruppare le righe per COLTURA (crop) + VARIETÀ + DATE per creare unità produttive.

REGOLE:
1. **Raggruppamento**: Righe con la stessa coltura, varietà e periodo → UNA unità produttiva
2. **Allocazioni**: Ogni riga contribuisce un'allocazione (campo) con dati catastali e superficie
3. **Superfici**: Converti in ettari (HA). Se valori > 1000, probabilmente sono in MQ (dividi per 10000)
4. **Date**: Converti in formato YYYY-MM-DD. Gestisci formati DD/MM/YYYY, DD-MM-YYYY, timestamp
5. **Coltura**: Identifica la coltura dalla colonna più rilevante (es. "Occupazione Suolo", "Coltura", "Tipo Utilizzo")
6. **Dati catastali**: Estrai foglio, particella, sezione se presenti
7. **Nome**: Crea nome come "NomeColtura - Varietà" (es. "Frumento tenero - Bolero")
8. **Non-agricolo**: ESCLUDI righe con uso non agricolo (fabbricati, tare, manufatti)

FORMATI COLONNE COMUNI:
- "[003] COLZA" → coltura = "COLZA"
- "870-011-000-000-000" → codice PAC AGEA
- "FRUMENTO TENERO" → coltura diretta
- Superfici: "1,2345" (formato italiano) o "1.2345" (formato standard)

IMPORTANTE:
- Se non trovi dati catastali (foglio/particella), usa il nome del campo o riga come fieldName
- Raggruppa per coltura: stessa coltura+varietà+date = UNICA unità con multiple allocazioni
- Gestisci il formato numerico italiano (virgola come separatore decimale)`,
      },
      {
        role: 'user' as const,
        content: `Estrai le unità produttive da questo CSV:\n\n${sampleContent}`,
      },
    ];

    const result = await invokeLLMWithRetry(
      (msgs, opts) => extractor.invoke(msgs, opts),
      llmMessages,
      { callbacks: [usageCollector] },
      { maxRetries: 2, timeoutMs: 60_000 },
    );

    // Log usage asynchronously
    usageLogger
      .logFromAccumulator(usageAccumulator, {
        jobType: LlmJobType.CSV_IMPORT,
        model: 'gpt-4o-mini',
        metadata: { step: 'production-unit-full-llm-extraction', rowsSampled: sampleLines.length },
      })
      .catch((err) =>
        console.warn('[PRODUCTION-UNIT-CSV] Failed to log full extraction usage:', err),
      );

    // Convert LLM output to ProductionUnitRaw[]
    const units: ProductionUnitRaw[] = result.units.map((llmUnit) => {
      const primaryCycle: ProductionCycleRaw = {
        cycleIndex: 0,
        cropName: llmUnit.cropName,
        cropType: llmUnit.cropType,
        cropCode: null,
        variety: llmUnit.variety,
        occupazione: llmUnit.cropName,
        destinazione: llmUnit.cropType,
        protectionStructure: null,
        startDate: llmUnit.startDate,
        endDate: llmUnit.endDate,
        floweringDate: null,
        harvestingDate: null,
      };

      const allocations = llmUnit.allocations.map((alloc) => ({
        fieldName: alloc.fieldName,
        sezione: alloc.sezione,
        foglio: alloc.foglio,
        particella: alloc.particella,
        subalterno: null,
        areaHa: alloc.areaHa,
      }));

      const totalAreaHa = allocations.reduce((sum, a) => sum + a.areaHa, 0);

      return {
        name: llmUnit.name,
        sezione: allocations[0]?.sezione ?? null,
        foglio: allocations[0]?.foglio ?? null,
        particella: allocations[0]?.particella ?? null,
        subalterno: null,
        areaHa: Math.round(totalAreaHa * 10000) / 10000,
        protocoll: 'LLM_EXTRACTED',
        startDate: llmUnit.startDate,
        endDate: llmUnit.endDate,
        cycles: [primaryCycle],
        allocations,
      };
    });

    console.log(
      `ProductionUnitCsvAgent: Full LLM extraction produced ${units.length} production units`,
    );

    return units;
  }
