import { hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { llmBatchMatchProductsToCrop } from './llmCropMatcher';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { CropMatchStageParams, buildProductKey } from './flowMatchCropTreatment.part-01-unit-job-stock-product-summary';
import { applyCompatibleLlmMatch } from './flowMatchCropTreatment.part-03-apply-compatible-llm-match';

export async function applyLlmCropMatching(params: CropMatchStageParams): Promise<void> {
  const { unitId, cropName, variety, areaHa, cropTaxonomy, allowed, unmatchedProducts, excludedFromMatching, quantitiesByProductKey, historyManager, context } = params;
// LLM CROP MATCHING: All products with labels are matched via LLM
if (unmatchedProducts.length > 0) {
  console.log(
    `[MATCH-LLM] ${unmatchedProducts.length} products to evaluate via LLM for unit ${unitId} (crop: ${cropName})`,
  );

  if (hasContext(context)) {
    const logger = DosageLoggerService.getInstance();
    logger.logMatchFallback({
      jobId: context.jobId,
      userId: context.userId,
      mechanicalMatches: 0,
      unmatchedProducts: unmatchedProducts.length,
      unitName: cropName || unitId,
      cropName: cropName || '',
      variety: variety || undefined,
    });
  }

  let llmMatches: Map<
    string,
    { isCompatible: boolean; confidence: number; reason: string; matchedCrops: string[] }
  >;
  let llmCallFailed = false;

  try {
    llmMatches = await llmBatchMatchProductsToCrop(
      unmatchedProducts.map((p) => ({
        key: buildProductKey(p.res.name, p.res.regNumber),
        name: p.res.name,
        label: p.label,
      })),
      cropName,
      variety,
      cropTaxonomy ?? undefined,
      context,
    );
  } catch (error) {
    // LLM call completely failed - mark all unmatched products as excluded with a clear reason
    console.error(
      `[MATCH-FALLBACK] LLM batch matching failed for unit ${unitId}:`,
      error instanceof Error ? error.message : String(error),
    );
    llmCallFailed = true;
    llmMatches = new Map();

    // Add all unmatched products to excluded list with LLM failure reason
    for (const { res, label } of unmatchedProducts) {
      excludedFromMatching.push({
        index: excludedFromMatching.length + 1,
        name: res.name,
        regNumber: res.regNumber,
        exclusionReason: `Verifica compatibilità non disponibile (servizio AI temporaneamente non raggiungibile). Il prodotto non è stato matchato meccanicamente con la coltura ${cropName}.`,
        category: label.categoria || null,
        product: res,
      });

      // Track in history
      historyManager.addEntry(
        unitId,
        `${res.name}|${res.regNumber}`,
        'Matching prodotto-coltura: LLM non disponibile',
        'Servizio AI non raggiungibile, prodotto escluso per precauzione',
        DosageAgentStep.LLM_FALLBACK_MATCHING,
        DataSource.LLM_OPENAI,
        {
          productionUnitId: unitId,
          cropName,
          variety,
          areaHa,
          productName: res.name,
          productRegistrationNumber: res.regNumber,
          description:
            'Errore nella chiamata LLM. Il prodotto non è stato selezionato per precauzione.',
        },
      );
    }
  }

  if (!llmCallFailed) {
    for (const { res, label } of unmatchedProducts) {
      const llmResult = llmMatches.get(buildProductKey(res.name, res.regNumber));
      const productKey = `${res.name}|${res.regNumber}`;
      if (llmResult && llmResult.isCompatible && llmResult.confidence >= 70) {
        applyCompatibleLlmMatch({
          result: res,
          label,
          llmResult,
          unitId,
          cropName,
          variety,
          areaHa,
          historyManager,
          quantitiesByProductKey,
          allowed,
        });
      } else if (llmResult) {
        console.log(
          `[MATCH-LLM] ✗ LLM rejected ${res.name} (confidence ${llmResult.confidence}%): ${llmResult.reason}`,
        );

        // Tracciamento: Prodotto rifiutato dall'LLM
        historyManager.addEntry(
          unitId,
          productKey,
          'Matching prodotto-coltura: Rifiutato da LLM',
          `Non compatibile (confidence: ${llmResult.confidence}%)`,
          DosageAgentStep.LLM_FALLBACK_MATCHING,
          DataSource.LLM_OPENAI,
          {
            productionUnitId: unitId,
            cropName,
            variety,
            areaHa,
            productName: res.name,
            productRegistrationNumber: res.regNumber,
            description: llmResult.reason,
          },
        );

        // Aggiungi ai prodotti esclusi con motivazione
        excludedFromMatching.push({
          index: excludedFromMatching.length + 1,
          name: res.name,
          regNumber: res.regNumber,
          exclusionReason: `Non compatibile con ${cropName}: ${llmResult.reason}`,
          category: label.categoria || null,
          product: res,
        });
      } else {
        // LLM returned no result for this specific product
        console.warn(
          `[MATCH-LLM] ✗ No LLM result for ${res.name} (${res.regNumber}) - product not evaluated`,
        );

        historyManager.addEntry(
          unitId,
          productKey,
          'Matching prodotto-coltura: Nessun risultato LLM',
          'Il modello non ha prodotto un risultato per questo prodotto',
          DosageAgentStep.LLM_FALLBACK_MATCHING,
          DataSource.LLM_OPENAI,
          {
            productionUnitId: unitId,
            cropName,
            variety,
            areaHa,
            productName: res.name,
            productRegistrationNumber: res.regNumber,
            description:
              'Nessun risultato LLM disponibile. Il prodotto non è stato selezionato per precauzione.',
          },
        );

        excludedFromMatching.push({
          index: excludedFromMatching.length + 1,
          name: res.name,
          regNumber: res.regNumber,
          exclusionReason: `Verifica compatibilità non disponibile: nessun risultato LLM per ${cropName}`,
          category: label.categoria || null,
          product: res,
        });
      }
    }

    console.log(
      `[MATCH-LLM] LLM crop matching completed: ${allowed.length} products matched for unit ${unitId}`,
    );
  } // end if (!llmCallFailed)
}
}
