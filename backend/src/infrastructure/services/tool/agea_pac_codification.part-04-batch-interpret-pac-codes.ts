import { createChatModel } from '../llm-model-factory';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { LlmJobType } from '@prisma/client';
import { AgeaPacCropResult, BatchAgeaPacResultSchema, usageLogger } from './agea_pac_codification.part-01-usage-logger';
import { ageaCodificationService } from './agea_pac_codification.part-02-agea-codification-service';
import { NON_AGRICULTURAL_GROUPS, interpretPacCodeWithLLM, parsePacCodeString, tryResolveFromAgeaCodification } from './agea_pac_codification.part-03-non-agricultural-groups';

/**
 * Batch interpret multiple PAC codes efficiently
 */
export async function batchInterpretPacCodes(
  pacCodes: Array<{ pacCode: string; colturaDescription?: string }>,
  context?: { userId?: string; companyId?: string; jobId?: string },
): Promise<Map<string, AgeaPacCropResult>> {
  const results = new Map<string, AgeaPacCropResult>();

  // Initialize AGEA service
  await ageaCodificationService.initialize();

  // First pass: resolve from AGEA codification
  const needsLlm: Array<{
    pacCode: string;
    parsed: NonNullable<ReturnType<typeof parsePacCodeString>>;
    colturaDescription?: string;
  }> = [];

  for (const { pacCode, colturaDescription } of pacCodes) {
    const parsed = parsePacCodeString(pacCode);
    if (!parsed) continue;

    const ageaResult = await tryResolveFromAgeaCodification(parsed, colturaDescription);
    if (ageaResult) {
      results.set(parsed.full, ageaResult);
    } else {
      needsLlm.push({ pacCode, parsed, colturaDescription });
    }
  }

  console.log(
    `[AGEA-PAC] Batch: ${results.size} resolved from AGEA codification, ${needsLlm.length} need LLM`,
  );

  // Second pass: batch LLM call for unknown codes
  if (needsLlm.length > 0) {
    const tracker = usageLogger.createTracker();
    const modelName = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    const { model: llm, modelName: resolvedModelName } = createChatModel({
      modelName,
      temperature: 0,
      maxTokens: 2000,
    });
    const parser = StructuredOutputParser.fromZodSchema(BatchAgeaPacResultSchema);

    const codesList = needsLlm
      .map((item, i) => {
        const desc = item.colturaDescription ? ` (${item.colturaDescription})` : '';
        return `${i + 1}. ${item.parsed.full}${desc}`;
      })
      .join('\n');

    const prompt = `Sei un esperto di codici PAC AGEA italiani. Interpreta i seguenti codici PAC e fornisci informazioni sulle colture.

CODICI PAC DA INTERPRETARE:
${codesList}

Il codice PAC AGEA segue il formato [Gruppo]-[Specie]-[Variante]-[Uso]-[Dettaglio]:
- Gruppo 870 = Seminativi, 880 = Orticole, 890 = Fruttiferi, 892 = Vite, 893 = Olivo
- Gruppo 780-785 = Uso Non Agricolo (TARE, fabbricati, boschi, etc.)
- Specie indica la coltura specifica

Per ogni codice, fornisci:
- species: nome scientifico
- cropType: nome comune italiano
- code: codice nel formato GENUS_SPE
- variety: varieta se specificata
- pacCode: breakdown del codice
- isAgricultural: true se agricolo, false per TARE/fabbricati/etc.

${parser.getFormatInstructions()}`;

    try {
      const response = await llm.invoke(prompt, { callbacks: tracker.callbacks });
      const content = typeof response.content === 'string' ? response.content : '';
      const batchResult = await parser.parse(content);

      for (let i = 0; i < batchResult.results.length && i < needsLlm.length; i++) {
        const result = batchResult.results[i];
        const original = needsLlm[i];
        results.set(original.parsed.full, result);
      }

      await usageLogger.logFromAccumulator(tracker.accumulator, {
        userId: context?.userId,
        companyId: context?.companyId,
        jobId: context?.jobId,
        jobType: LlmJobType.CSV_IMPORT,
        model: resolvedModelName,
        metadata: { step: 'agea-pac-batch-interpretation', count: needsLlm.length },
      });

      console.log(`[AGEA-PAC] LLM batch resolved ${batchResult.results.length} codes`);
    } catch (error) {
      console.error('[AGEA-PAC] Error in batch interpretation:', error);
      // Fallback: try individual interpretation
      for (const item of needsLlm) {
        const result = await interpretPacCodeWithLLM(
          item.pacCode,
          item.colturaDescription,
          context,
        );
        if (result) {
          results.set(item.parsed.full, result);
        }
      }
    }
  }

  return results;
}

/**
 * Get crop identification from PAC code (compatible with ProductionCycleRaw)
 */
export async function getCropFromPacCode(
  pacCode: string,
  colturaDescription?: string,
  context?: { userId?: string; companyId?: string; jobId?: string },
): Promise<{
  cropName: string | null;
  cropType: string | null;
  cropCode: string | null;
  variety: string | null;
  isAgricultural: boolean;
}> {
  const result = await interpretPacCodeWithLLM(pacCode, colturaDescription, context);

  if (!result) {
    return {
      cropName: null,
      cropType: colturaDescription || 'Sconosciuto',
      cropCode: null,
      variety: null,
      isAgricultural: true,
    };
  }

  return {
    cropName: result.species,
    cropType: result.cropType,
    cropCode: result.code,
    variety: result.variety,
    isAgricultural: result.isAgricultural,
  };
}

/**
 * Check if a PAC code represents non-agricultural use
 */
export function isNonAgriculturalPacCode(pacCode: string): boolean {
  // Special case: Overlapping (OVL-OVL-OVL-OVL-OVL)
  if (pacCode && pacCode.toUpperCase().includes('OVL')) {
    return true;
  }

  const parsed = parsePacCodeString(pacCode);
  if (!parsed) return false;

  return NON_AGRICULTURAL_GROUPS.has(parsed.gruppo);
}

/**
 * Get crop description by AGEA occupation code (direct lookup)
 */
export async function getCropByOccupationCode(code: string): Promise<string | null> {
  await ageaCodificationService.initialize();
  return ageaCodificationService.getOccupationDescription(code);
}

/**
 * Search crops by name in AGEA database
 */
export async function searchCropsByName(
  query: string,
): Promise<Array<{ code: string; description: string }>> {
  await ageaCodificationService.initialize();
  return ageaCodificationService.searchByName(query);
}
