import { z } from 'zod';
import { invokeLLMWithRetry } from '../file_agent/utils/csv_parser';
import { LlmJobType } from '@prisma/client';
import { LangChainUsageCollector, UsageAccumulator } from '../../llm_costs/usage';
import { usageLogger } from './production_unit_csv_agent.support';
import type { ProductionUnitCsvAgentContext } from './production-unit-csv-agent.context';

export async function productionUnitCsvAgentResolveCycleDatesWithLLM(this: ProductionUnitCsvAgentContext, inputs: Array<{ cropName: string; cycleType: 'primary' | 'secondary' | null; year: string }>): Promise<Map<string, { startDate: string; endDate: string }>> {
    const result = new Map<string, { startDate: string; endDate: string }>();

    // Deduplicate by cropName + cycleType
    const uniqueInputs = new Map<string, { cropName: string; cycleType: string; year: string }>();
    for (const input of inputs) {
      const ct = input.cycleType === 'secondary' ? 'secondaria' : 'primaria';
      const key = `${this.normalizeString(input.cropName)}|${ct}`;
      if (!uniqueInputs.has(key)) {
        uniqueInputs.set(key, { cropName: input.cropName, cycleType: ct, year: input.year });
      }
    }

    if (uniqueInputs.size === 0) return result;

    const toResolve = Array.from(uniqueInputs.values());

    const CycleDatesSchema = z.object({
      cycles: z.array(
        z.object({
          cropName: z.string().describe('The crop name as provided'),
          cycleType: z.string().describe('primaria or secondaria'),
          startMonth: z
            .number()
            .min(1)
            .max(12)
            .describe('Typical sowing/start month (1-12) for this crop in Italy'),
          endMonth: z
            .number()
            .min(1)
            .max(12)
            .describe('Typical harvest/end month (1-12) for this crop in Italy'),
        }),
      ),
    });

    try {
      const datesUsageAccumulator = new UsageAccumulator();
      const datesUsageCollector = new LangChainUsageCollector(datesUsageAccumulator);
      const extractor = this.getModel().withStructuredOutput(CycleDatesSchema);

      const messages = [
        {
          role: 'system' as const,
          content: `You are an Italian agricultural expert. For each crop and cycle type (primaria/secondaria), provide the typical sowing/start month and harvest/end month in Italy.

Rules:
- "Primaria" is the main crop of the year (typically spring-summer)
- "Secondaria" is the secondary crop, planted after the primary harvest (typically summer-autumn)
- Return month numbers (1=January, 12=December)
- Consider typical Italian agricultural calendars
- For perennial crops (vite, olivo, fruttiferi), use the full growing season

Examples:
- Mais primaria: start=3 (March), end=9 (September)
- Sorgo secondaria: start=6 (June), end=10 (October)
- Frumento tenero primaria: start=10 (October previous year → treat as 1 January), end=7 (July)
- Soia secondaria: start=6 (June), end=10 (October)`,
        },
        {
          role: 'user' as const,
          content: `Provide typical cycle dates for these crops:\n${toResolve
            .map((input, i) => `${i + 1}. "${input.cropName}" - ${input.cycleType}`)
            .join('\n')}`,
        },
      ];

      const llmResult = await invokeLLMWithRetry(
        (msgs, opts) => extractor.invoke(msgs, opts),
        messages,
        { callbacks: [datesUsageCollector] },
        { maxRetries: 2, timeoutMs: 30_000 },
      );

      // Log usage asynchronously
      usageLogger
        .logFromAccumulator(datesUsageAccumulator, {
          jobType: LlmJobType.CSV_IMPORT,
          model: 'gpt-4o-mini',
          metadata: {
            step: 'production-unit-cycle-dates',
            cropCount: toResolve.length,
          },
        })
        .catch((err) =>
          console.warn('[PRODUCTION-UNIT-CSV] Failed to log cycle dates usage:', err),
        );

      // Map results
      for (let i = 0; i < llmResult.cycles.length && i < toResolve.length; i++) {
        const cycle = llmResult.cycles[i];
        const input = toResolve[i];
        const key = `${this.normalizeString(input.cropName)}|${input.cycleType}`;
        const startDay = '01';
        const endDay = new Date(parseInt(input.year), cycle.endMonth, 0)
          .getDate()
          .toString()
          .padStart(2, '0');
        result.set(key, {
          startDate: `${input.year}-${cycle.startMonth.toString().padStart(2, '0')}-${startDay}`,
          endDate: `${input.year}-${cycle.endMonth.toString().padStart(2, '0')}-${endDay}`,
        });
      }

      console.log(
        `ProductionUnitCsvAgent: LLM resolved cycle dates for ${result.size} crop/cycle combinations`,
      );
    } catch (err) {
      console.warn(
        `ProductionUnitCsvAgent: LLM cycle date resolution failed, using defaults:`,
        err,
      );

      // Fallback to generic defaults
      for (const input of toResolve) {
        const key = `${this.normalizeString(input.cropName)}|${input.cycleType}`;
        if (input.cycleType === 'secondaria') {
          result.set(key, {
            startDate: `${input.year}-07-01`,
            endDate: `${input.year}-12-31`,
          });
        } else {
          result.set(key, {
            startDate: `${input.year}-01-01`,
            endDate: `${input.year}-06-30`,
          });
        }
      }
    }

    return result;
  }
