import { prisma } from '../../../repositories/Prisma';
import { Prisma } from '@prisma/client';
import {
  ConformityCheckInput,
  ConformityCheckOutput,
  JobOptimizationProposal,
  ConformityViolation,
  ConfirmConformityCheckInput,
  ConfirmConformityCheckOutput,
  JobConfirmationResult,
  JobWithRelations,
  LabelMap,
} from './types';
import { checkActiveIngredientCompatibility } from '../dosage_agent/activeIngredientCompatibilityChecker';
import { JobHistoryManager } from '../dosage_agent/historyCollector';
import { enrichDosageDetailsFromBdf } from '../dosage_agent/bdfDosageEnricher';
import { ConformityCheckerContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { calculateAggregatedStock } from '../dosage_agent/stockAggregator';

import {
  loadJobsByGroupId,
  loadLabelsForProducts,
  loadLabelForJob,
  loadCompanyIdsByProductIds,
  loadFieldDataForProductionUnits,
  extractMissingLabels,
  loadJobsForConfirmation,
} from './loaders';
import { extractLabelFromExtraction, findLabelForProduct, resolveLabel } from './matchers';
import { analyzeUserNotes } from './userNotesAnalyzer';
import { checkSingleJobConformity } from './singleJobChecker';
import {
  buildUnitDataForCompatibilityCheck,
  buildConformityAlertNotes,
  buildConformityNote,
} from './builders';
import { checkRevokedProducts } from './revokedProductChecker';
import { checkSAGroupLimits } from './saGroupChecker';
import { checkBufferZoneDoseConformity } from './bufferZoneChecker';
import { checkRulesCompliance } from './rulesComplianceChecker';
import { createConformityHistoryManager } from './historyCollector';
import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';

/**
 * Processes user notes and returns analysis result with rules and warnings
 */
async function processUserNotes(
  notes: string | undefined,
  context: ConformityCheckerContext | undefined,
  logger: DosageLoggerService,
): Promise<{
  userNotesRules: string[];
  userNotesWarnings: ConformityViolation[];
  userNotesAnalysis?: ConformityCheckOutput['userNotesAnalysis'];
}> {
  if (!notes) {
    return { userNotesRules: [], userNotesWarnings: [] };
  }

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: 'Analisi note utente in corso...',
    });
  }

  const analysis = await analyzeUserNotes(notes);

  console.log(
    `[CONFORMITY-CHECKER] User notes analyzed: ${analysis.appliedRules.length} rules applied, ${analysis.ignoredRules.length} ignored`,
  );

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Note utente analizzate: ${analysis.appliedRules.length} regole applicate, ${analysis.ignoredRules.length} ignorate`,
      metadata: {
        appliedRules: analysis.appliedRules.length,
        ignoredRules: analysis.ignoredRules.length,
        warnings: analysis.warnings.length,
      },
    });
  }

  return {
    userNotesRules: analysis.appliedRules,
    userNotesWarnings: analysis.warnings,
    userNotesAnalysis: {
      originalNotes: notes,
      appliedRules: analysis.appliedRules,
      ignoredRules: analysis.ignoredRules,
    },
  };
}

/**
 * Checks active ingredient compatibility across all units
 */
async function checkIngredientCompatibility(
  jobs: JobWithRelations[],
  labelByRegNumber: LabelMap,
  labelByProductName: LabelMap,
): Promise<Map<string, { isCompatible: boolean; reason: string | null }>> {
  const unitData = buildUnitDataForCompatibilityCheck(jobs, labelByRegNumber, labelByProductName);

  const historyManager = new JobHistoryManager();
  const compatibilityResults = new Map<string, { isCompatible: boolean; reason: string | null }>();

  for (const unit of unitData) {
    const checkResult = await checkActiveIngredientCompatibility(unit, historyManager);
    for (const productResult of checkResult.productResults) {
      if (!productResult.isCompatible) {
        const key = `${productResult.productName}|${productResult.regNumber}`;
        compatibilityResults.set(key, {
          isCompatible: false,
          reason: productResult.incompatibilityReason,
        });
      }
    }
  }

  return compatibilityResults;
}

/**
 * Groups jobs by production unit and product for N max applications check
 */
function groupJobsByUnitAndProduct(jobs: JobWithRelations[]): Map<string, JobWithRelations[]> {
  const jobsByUnitAndProduct = new Map<string, JobWithRelations[]>();

  for (const job of jobs) {
    const regNumber = job.stocks[0]?.product?.registrationNumber ?? '';
    const productName = job.stocks[0]?.product?.name ?? '';
    const key = `${job.productionUnitId}|${regNumber || productName}`;
    if (!jobsByUnitAndProduct.has(key)) {
      jobsByUnitAndProduct.set(key, []);
    }
    jobsByUnitAndProduct.get(key)!.push(job);
  }

  return jobsByUnitAndProduct;
}

/**
 * Creates a proposal for a job based on conformity check results
 */
async function createJobProposal(
  job: JobWithRelations,
  allJobsForProduct: JobWithRelations[],
  compatibilityResults: Map<string, { isCompatible: boolean; reason: string | null }>,
  userNotesRules: string[],
  userNotesWarnings: ConformityViolation[],
  labelByRegNumber?: LabelMap,
  labelByProductName?: LabelMap,
  revokedViolations?: Map<string, ConformityViolation>,
): Promise<JobOptimizationProposal> {
  const productStock = job.stocks[0];
  const regNumber = productStock?.product?.registrationNumber ?? '';
  const productName = productStock?.product?.name ?? '';

  // Use cached labels if available, otherwise load from DB
  let resolved: {
    label: import('../../../../domain/dtos/label.dto').Label | null;
    effectiveRegNumber: string;
  };
  if (labelByRegNumber && labelByProductName) {
    resolved = resolveLabel(regNumber, productName, labelByRegNumber, labelByProductName);
  } else {
    const labelExtraction = await loadLabelForJob({
      registrationNumber: regNumber,
      productName,
    });
    resolved = {
      label: extractLabelFromExtraction(labelExtraction),
      effectiveRegNumber: regNumber || (labelExtraction?.registrationNumber ?? ''),
    };
  }
  const { label, effectiveRegNumber } = resolved;

  // Look up revoked violation for this product
  const revokedKey = `${regNumber}|${productName}`;
  const revokedViolation = revokedViolations?.get(revokedKey);

  const { violations, proposedValues, shouldExclude, exclusionReason } =
    await checkSingleJobConformity({
      job,
      label,
      allJobsForProduct,
      userNotesRules,
      revokedViolation,
    });

  // Add violation if label is missing for pesticide or fertilizer
  const requiresLabel =
    productStock?.product?.category === 'PESTICIDE' ||
    productStock?.product?.category === 'FERTILIZER';

  if (!label && requiresLabel) {
    violations.push({
      type: 'LABEL_NOT_FOUND',
      message: `Etichetta non trovata per il prodotto "${productName}" (reg. ${regNumber || 'N/A'}). Impossibile verificare conformità dose e applicazioni.`,
      severity: 'WARNING',
      source: 'SYSTEM',
      field: 'label',
    });
  }

  // Add violations from active ingredient compatibility
  const compatKey = `${productName}|${regNumber}`;
  const compatResult = compatibilityResults.get(compatKey);
  if (compatResult && !compatResult.isCompatible) {
    violations.push({
      type: 'ACTIVE_INGREDIENT_INCOMPATIBILITY',
      message: compatResult.reason ?? 'Incompatibilità principio attivo rilevata',
      severity: 'ERROR',
      source: 'LABEL',
    });
  }

  // Add warnings from user notes
  violations.push(...userNotesWarnings);

  return {
    jobId: job.id,
    productionUnitId: job.productionUnitId,
    productName,
    registrationNumber: effectiveRegNumber,
    wasAlreadyChecked: false,
    isConform: violations.filter((v: ConformityViolation) => v.severity === 'ERROR').length === 0,
    violations,
    originalValues: {
      quantity: job.quantity,
      unitOfMeasureQuantity: job.unitOfMeasureQuantity,
      dateOfOpeation: job.dateOfOpeation,
      treatedSurface: job.productionUnit.areaHa,
    },
    proposedValues: {
      ...proposedValues,
      note: buildConformityNote({
        productName,
        quantity: proposedValues.quantity,
        unitOfMeasureQuantity: proposedValues.unitOfMeasureQuantity,
        treatedSurfaceHa: job.productionUnit.areaHa,
        existingNote: job.note ?? null,
        proposedNote: proposedValues.note,
      }),
    },
    shouldExclude,
    exclusionReason,
  };
}

/**
 * Enriches proposals with alert notes and stock information
 */
async function enrichProposalsWithAlertNotes(
  proposals: JobOptimizationProposal[],
  allJobs: JobWithRelations[],
  labelByRegNumber?: LabelMap,
  labelByProductName?: LabelMap,
): Promise<JobOptimizationProposal[]> {
  if (proposals.length === 0) {
    return [];
  }

  const jobsById = new Map<string, JobWithRelations>();
  for (const job of allJobs) {
    jobsById.set(job.id, job);
  }

  // Collect unique product IDs and their data
  const uniqueProductIds = new Set<string>();
  const quantityUnitByProductId = new Map<string, string>();

  for (const job of allJobs) {
    const stock = job.stocks[0];
    const product = stock?.product;
    if (!product) continue;

    uniqueProductIds.add(product.id);
    if (!quantityUnitByProductId.has(product.id)) {
      quantityUnitByProductId.set(product.id, job.unitOfMeasureQuantity);
    }
  }

  // Load company IDs in a single batch query
  const productIdArray = Array.from(uniqueProductIds);
  const companyIdByProductId = await loadCompanyIdsByProductIds(productIdArray);

  // Calculate total required per product
  const totalRequiredByProductId = new Map<string, number>();
  for (const proposal of proposals) {
    const job = jobsById.get(proposal.jobId);
    if (!job) continue;

    const stock = job.stocks[0];
    const product = stock?.product;
    if (!product) continue;

    const finalQuantity = proposal.shouldExclude ? 0 : proposal.proposedValues.quantity;
    totalRequiredByProductId.set(
      product.id,
      (totalRequiredByProductId.get(product.id) ?? 0) + finalQuantity,
    );
  }

  // Calculate aggregated stock in parallel
  const stockEntries = Array.from(companyIdByProductId.entries());
  const stockResults = await Promise.all(
    stockEntries.map(([productId, companyId]) =>
      calculateAggregatedStock(prisma, { productId, companyId }),
    ),
  );

  const availableStockByProductId = new Map<string, number>();
  stockEntries.forEach(([productId], index) => {
    availableStockByProductId.set(productId, stockResults[index].availableStock);
  });

  // Enrich proposals in parallel batches
  const ENRICH_BATCH_SIZE = 10;
  const enrichedProposals: JobOptimizationProposal[] = [];

  for (let i = 0; i < proposals.length; i += ENRICH_BATCH_SIZE) {
    const batch = proposals.slice(i, i + ENRICH_BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async (proposal) => {
        const job = jobsById.get(proposal.jobId);
        if (!job) {
          return proposal;
        }

        const stock = job.stocks[0];
        const product = stock?.product;
        if (!product) {
          return proposal;
        }

        const productId = product.id;
        const quantityUnit = quantityUnitByProductId.get(productId) ?? null;
        const stockInWarehouse = availableStockByProductId.get(productId) ?? null;
        const totalStockRequiredForJobs = totalRequiredByProductId.get(productId) ?? null;

        // Resolve label from cached maps or DB
        const regNumberForLookup = product.registrationNumber ?? proposal.registrationNumber ?? '';
        let label: import('../../../../domain/dtos/label.dto').Label | null;
        let effectiveRegistrationNumber: string;
        if (labelByRegNumber && labelByProductName) {
          const resolved = resolveLabel(
            regNumberForLookup,
            proposal.productName,
            labelByRegNumber,
            labelByProductName,
          );
          label = resolved.label;
          effectiveRegistrationNumber =
            (proposal.registrationNumber ?? '').trim() ||
            (product.registrationNumber ?? '').trim() ||
            resolved.effectiveRegNumber;
        } else {
          const labelExtraction = await loadLabelForJob({
            registrationNumber: regNumberForLookup,
            productName: proposal.productName,
          });
          label = extractLabelFromExtraction(labelExtraction);
          effectiveRegistrationNumber =
            (proposal.registrationNumber ?? '').trim() ||
            (product.registrationNumber ?? '').trim() ||
            (labelExtraction?.registrationNumber ?? '').trim();
        }

        const alertNotes = await buildConformityAlertNotes({
          label,
          job,
          registrationNumber: effectiveRegistrationNumber,
          productId,
          productName: proposal.productName,
          stockInWarehouse,
          stockInWarehouseUm: quantityUnit,
          totalStockRequiredForJobs,
          totalStockRequiredForJobsUm: quantityUnit,
        });

        const enrichedNote = buildConformityNote({
          productName: proposal.productName,
          quantity: proposal.proposedValues.quantity,
          unitOfMeasureQuantity: proposal.proposedValues.unitOfMeasureQuantity,
          treatedSurfaceHa: job.productionUnit.areaHa,
          existingNote: null,
          proposedNote: proposal.proposedValues.note,
          stockInWarehouse,
          totalStockRequired: totalStockRequiredForJobs,
        });

        return {
          ...proposal,
          proposedValues: {
            ...proposal.proposedValues,
            note: enrichedNote,
            alertNotes: alertNotes as unknown as Record<string, unknown>,
          },
        };
      }),
    );

    enrichedProposals.push(...batchResults);
  }

  return enrichedProposals;
}

/**
 * Calculates summary statistics from proposals
 */
function calculateSummary(
  allJobsCount: number,
  alreadyCheckedCount: number,
  newlyCheckedCount: number,
  proposals: JobOptimizationProposal[],
): ConformityCheckOutput['summary'] {
  const errorCount = proposals.reduce(
    (sum, p) => sum + p.violations.filter((v) => v.severity === 'ERROR').length,
    0,
  );
  const warningCount = proposals.reduce(
    (sum, p) => sum + p.violations.filter((v) => v.severity === 'WARNING').length,
    0,
  );

  return {
    totalJobs: allJobsCount,
    alreadyCheckedJobs: alreadyCheckedCount,
    newlyCheckedJobs: newlyCheckedCount,
    conformJobs: proposals.filter((p) => p.isConform).length,
    nonConformJobs: proposals.filter((p) => !p.isConform).length,
    jobsToExclude: proposals.filter((p) => p.shouldExclude).length,
    totalViolations: proposals.reduce((sum, p) => sum + p.violations.length, 0),
    errorCount,
    warningCount,
  };
}

/**
 * Returns empty output when no jobs are found
 */
function createEmptyOutput(jobGroupId: string): ConformityCheckOutput {
  return {
    jobGroupId,
    proposals: [],
    summary: {
      totalJobs: 0,
      alreadyCheckedJobs: 0,
      newlyCheckedJobs: 0,
      conformJobs: 0,
      nonConformJobs: 0,
      jobsToExclude: 0,
      totalViolations: 0,
      errorCount: 0,
      warningCount: 0,
    },
    checkedAt: new Date(),
  };
}

/**
 * Runs the complete conformity check for a job group
 */
export async function runConformityCheck(
  input: ConformityCheckInput,
  context?: ConformityCheckerContext,
): Promise<ConformityCheckOutput> {
  console.log(`[CONFORMITY-CHECKER] Starting check for jobGroupId: ${input.jobGroupId}`);
  const startTime = Date.now();
  const logger = DosageLoggerService.getInstance();

  if (hasContext(context)) {
    logger.logInfo({
      jobId: context.jobId,
      userId: context.userId,
      message: `Avvio controllo conformità`,
      metadata: { hasNotes: Boolean(input.notes) },
    });
  }

  // 1. Load all jobs for the group
  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: 'Caricamento interventi dal database...',
    });
  }

  const allJobs = await loadJobsByGroupId(input.jobGroupId);
  if (allJobs.length === 0) {
    if (hasContext(context)) {
      logger.logWarning({
        jobId: context.jobId,
        userId: context.userId,
        message: 'Nessun intervento trovato per questo gruppo',
      });
    }
    return {
      ...createEmptyOutput(input.jobGroupId),
      warnings: [
        `Nessun intervento trovato per il gruppo "${input.jobGroupId}". Verificare che l'ID del gruppo sia corretto.`,
      ],
    };
  }

  console.log(`[CONFORMITY-CHECKER] Loaded ${allJobs.length} jobs`);
  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `${allJobs.length} interventi caricati dal database`,
      metadata: { totalJobs: allJobs.length },
    });
  }

  // System warnings collector
  const systemWarnings: string[] = [];
  const historyManager = createConformityHistoryManager();

  // 1.1. Load field data for production units (batch)
  const uniqueUnitIds = [...new Set(allJobs.map((j) => j.productionUnitId))];
  const fieldDataByUnit = await loadFieldDataForProductionUnits(uniqueUnitIds);

  console.log(
    `[CONFORMITY-CHECKER] Loaded field data for ${fieldDataByUnit.size}/${uniqueUnitIds.length} units`,
  );

  // 1.2. Derive companyId from field data or context
  const derivedCompanyId =
    context?.companyId ??
    [...fieldDataByUnit.values()].find((fd) => fd.companyId)?.companyId ??
    null;

  // 2. Analyze user notes
  const { userNotesRules, userNotesWarnings, userNotesAnalysis } = await processUserNotes(
    input.notes,
    context,
    logger,
  );

  // 3. Load labels for all products
  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: 'Caricamento etichette prodotti...',
    });
  }

  const registrationNumbers = allJobs
    .map((j) => j.stocks[0]?.product?.registrationNumber)
    .filter((rn): rn is string => Boolean(rn));
  const productNames = allJobs
    .map((j) => j.stocks[0]?.product?.name)
    .filter((name): name is string => Boolean(name));

  const { labelByRegNumber, labelByProductName } = await loadLabelsForProducts(
    [...new Set(registrationNumbers)],
    [...new Set(productNames)],
  );

  console.log(
    `[CONFORMITY-CHECKER] Loaded ${labelByRegNumber.size} labels by regNumber, ${labelByProductName.size} by productName`,
  );

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `${labelByRegNumber.size + labelByProductName.size} etichette prodotto caricate`,
      metadata: {
        labelsByRegNumber: labelByRegNumber.size,
        labelsByProductName: labelByProductName.size,
        uniqueProducts: registrationNumbers.length,
      },
    });
  }

  // 3.1. Identify products without labels and extract them from SIAN
  const productsWithoutLabel: Array<{ name: string; regNumber: string }> = [];
  const seenProductKeys = new Set<string>();

  for (const job of allJobs) {
    const product = job.stocks[0]?.product;
    if (!product) continue;

    const regNumber = product.registrationNumber ?? '';
    const productName = product.name ?? '';
    const productKey = `${productName.toLowerCase()}|${regNumber}`;

    // Skip if already processed
    if (seenProductKeys.has(productKey)) continue;
    seenProductKeys.add(productKey);

    // Check if label was found
    const normalizedRegNumber = regNumber.replace(/^0+/, '');
    const hasLabel =
      labelByRegNumber.has(regNumber) ||
      labelByRegNumber.has(normalizedRegNumber) ||
      labelByProductName.has(productName.toLowerCase().trim());

    // Only try to extract PESTICIDE labels (not FERTILIZER for now)
    if (!hasLabel && regNumber && product.category === 'PESTICIDE') {
      productsWithoutLabel.push({ name: productName, regNumber });
    }
  }

  if (productsWithoutLabel.length > 0) {
    console.log(
      `[CONFORMITY-CHECKER] Found ${productsWithoutLabel.length} products without labels, attempting extraction...`,
    );

    if (hasContext(context)) {
      logger.logFlow({
        jobId: context.jobId,
        userId: context.userId,
        message: `Estrazione di ${productsWithoutLabel.length} etichette mancanti da SIAN...`,
        metadata: {
          productsToExtract: productsWithoutLabel.map((p) => `${p.name} (${p.regNumber})`),
        },
      });
    }

    const extractedLabels = await extractMissingLabels(productsWithoutLabel, context);

    // Merge extracted labels into existing maps
    for (const [key, label] of extractedLabels.labelByRegNumber) {
      labelByRegNumber.set(key, label);
    }
    for (const [key, label] of extractedLabels.labelByProductName) {
      labelByProductName.set(key, label);
    }

    console.log(
      `[CONFORMITY-CHECKER] After extraction: ${labelByRegNumber.size} labels by regNumber, ${labelByProductName.size} by productName`,
    );

    if (hasContext(context)) {
      logger.logFlow({
        jobId: context.jobId,
        userId: context.userId,
        message: `Estrazione etichette completata. ${labelByRegNumber.size} etichette disponibili.`,
        metadata: {
          extractedCount: extractedLabels.labelByRegNumber.size,
          totalLabels: labelByRegNumber.size,
        },
      });
    }
  }

  // 3.2. BDF enrichment for labels with incomplete critical fields
  // (dose_minima, dose_massima, n_max_applicazioni, intervallo_min_giorni, etc.)
  {
    const CRITICAL_LABEL_FIELDS: ReadonlyArray<keyof LabelDoseDetail> = [
      'n_max_applicazioni',
      'intervallo_min_giorni',
      'intervallo_sicurezza_giorni',
      'dose_minima',
      'dose_massima',
    ];

    const labelsToEnrich: Array<{
      mapKey: string;
      mapType: 'regNumber' | 'productName';
      regNumber: string;
      productName: string;
      cropName: string;
    }> = [];

    // Find labels with null critical fields
    const processedKeys = new Set<string>();
    for (const job of allJobs) {
      const product = job.stocks[0]?.product;
      if (!product || product.category !== 'PESTICIDE') continue;

      const regNumber = product.registrationNumber ?? '';
      const productName = product.name ?? '';
      const checkKey = `${productName.toLowerCase()}|${regNumber}`;
      if (processedKeys.has(checkKey)) continue;
      processedKeys.add(checkKey);

      const labelExtraction = findLabelForProduct(
        regNumber,
        productName,
        labelByRegNumber,
        labelByProductName,
      );
      const label = extractLabelFromExtraction(labelExtraction) as Label | null;
      if (!label) continue;

      const dosaggiDettagliati = (label as unknown as { dosaggi_dettagliati?: LabelDoseDetail[] })
        .dosaggi_dettagliati;
      if (!dosaggiDettagliati || dosaggiDettagliati.length === 0) {
        // No dosageDetails at all - needs BDF primary mode
        const mapKey = regNumber
          ? labelByRegNumber.has(regNumber)
            ? regNumber
            : regNumber.replace(/^0+/, '')
          : productName.toLowerCase().trim();
        const mapType =
          regNumber && labelByRegNumber.has(mapKey)
            ? ('regNumber' as const)
            : ('productName' as const);
        labelsToEnrich.push({
          mapKey,
          mapType,
          regNumber,
          productName,
          cropName: job.productionCycle?.cropName ?? '',
        });
        continue;
      }

      // Check if any dosageDetail has null critical fields
      const needsEnrichment = dosaggiDettagliati.some((d) =>
        CRITICAL_LABEL_FIELDS.some((field) => d[field] == null),
      );
      if (needsEnrichment) {
        const mapKey = regNumber
          ? labelByRegNumber.has(regNumber)
            ? regNumber
            : regNumber.replace(/^0+/, '')
          : productName.toLowerCase().trim();
        const mapType =
          regNumber && labelByRegNumber.has(mapKey)
            ? ('regNumber' as const)
            : ('productName' as const);
        labelsToEnrich.push({
          mapKey,
          mapType,
          regNumber,
          productName,
          cropName: job.productionCycle?.cropName ?? '',
        });
      }
    }

    if (labelsToEnrich.length > 0) {
      console.log(
        `[CONFORMITY-CHECKER] Enriching ${labelsToEnrich.length} labels with incomplete fields via BDF`,
      );

      if (hasContext(context)) {
        logger.logFlow({
          jobId: context.jobId,
          userId: context.userId,
          message: `Arricchimento di ${labelsToEnrich.length} etichette con dati BDF...`,
        });
      }

      const BDF_BATCH_SIZE = 5;
      for (let bdfIdx = 0; bdfIdx < labelsToEnrich.length; bdfIdx += BDF_BATCH_SIZE) {
        const bdfBatch = labelsToEnrich.slice(bdfIdx, bdfIdx + BDF_BATCH_SIZE);
        await Promise.all(
          bdfBatch.map(async (item) => {
            try {
              const sourceMap =
                item.mapType === 'regNumber' ? labelByRegNumber : labelByProductName;
              const existingLabelExtraction = sourceMap.get(item.mapKey);
              if (!existingLabelExtraction) return;

              const existingLabel = extractLabelFromExtraction(
                existingLabelExtraction,
              ) as Label | null;
              if (!existingLabel) return;

              const existingDosaggi =
                (existingLabel as unknown as { dosaggi_dettagliati?: LabelDoseDetail[] })
                  .dosaggi_dettagliati ?? [];

              const enrichedDosaggi = await enrichDosageDetailsFromBdf(
                existingDosaggi,
                item.regNumber,
                item.productName,
                item.cropName,
              );

              if (enrichedDosaggi !== existingDosaggi) {
                // Update the label in the map with enriched dosage details
                const enrichedLabel = {
                  ...existingLabel,
                  dosaggi_dettagliati: [...enrichedDosaggi],
                };
                const enrichedExtraction = {
                  ...(existingLabelExtraction as Record<string, unknown>),
                  label: enrichedLabel as unknown,
                };
                sourceMap.set(
                  item.mapKey,
                  enrichedExtraction as unknown as typeof existingLabelExtraction,
                );

                console.log(
                  `[CONFORMITY-CHECKER] BDF enriched label for ${item.productName}: ${enrichedDosaggi.length} dosage details`,
                );
              }
            } catch (err) {
              const errorMsg = err instanceof Error ? err.message : String(err);
              console.warn(
                `[CONFORMITY-CHECKER] BDF enrichment failed for ${item.productName}: ${errorMsg}`,
              );
              systemWarnings.push(
                `BDF enrichment fallito per "${item.productName}": ${errorMsg}. I dati etichetta potrebbero essere incompleti.`,
              );
            }
          }),
        );
      }
    }
  }

  // 3.3. Check revoked products (synchronous, fast)
  const { violations: revokedViolations, systemWarning: revokedWarning } =
    checkRevokedProducts(allJobs);

  if (revokedWarning) {
    systemWarnings.push(revokedWarning);
  }

  if (revokedViolations.size > 0) {
    console.log(`[CONFORMITY-CHECKER] Found ${revokedViolations.size} revoked products`);
    if (hasContext(context)) {
      logger.logFlow({
        jobId: context.jobId,
        userId: context.userId,
        message: `${revokedViolations.size} prodotti revocati trovati`,
        metadata: { revokedProducts: revokedViolations.size },
      });
    }
  }

  // 4. Check active ingredient compatibility
  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: 'Verifica compatibilità principi attivi...',
    });
  }

  const compatibilityResults = await checkIngredientCompatibility(
    allJobs,
    labelByRegNumber,
    labelByProductName,
  );

  console.log(
    `[CONFORMITY-CHECKER] Compatibility check found ${compatibilityResults.size} incompatible products`,
  );

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Verifica compatibilità completata: ${compatibilityResults.size} prodotti incompatibili trovati`,
      metadata: { incompatibleProducts: compatibilityResults.size },
    });
  }

  // 5. Filter jobs to check (exclude already checked ones)
  const jobsToCheck = allJobs.filter((job) => !job.conformityChecked);
  const alreadyCheckedJobs = allJobs.filter((job) => job.conformityChecked);

  console.log(
    `[CONFORMITY-CHECKER] Jobs to check: ${jobsToCheck.length}, already checked: ${alreadyCheckedJobs.length}`,
  );

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Verifica conformità per ${jobsToCheck.length} nuovi interventi (${alreadyCheckedJobs.length} già verificati)`,
    });
  }

  // Early exit if no jobs to check - skip expensive operations
  if (jobsToCheck.length === 0) {
    const elapsed = Date.now() - startTime;
    console.log(`[CONFORMITY-CHECKER] No jobs to check, early exit in ${elapsed}ms`);

    if (hasContext(context)) {
      logger.logTiming({
        jobId: context.jobId,
        userId: context.userId,
        phase: 'conformity-check',
        duration: elapsed,
      });
    }

    return {
      jobGroupId: input.jobGroupId,
      proposals: [],
      summary: {
        totalJobs: allJobs.length,
        alreadyCheckedJobs: alreadyCheckedJobs.length,
        newlyCheckedJobs: 0,
        conformJobs: 0,
        nonConformJobs: 0,
        jobsToExclude: 0,
        totalViolations: 0,
        errorCount: 0,
        warningCount: 0,
      },
      userNotesAnalysis,
      checkedAt: new Date(),
    };
  }

  // 6. Group all jobs by unit and product for N max applications check
  const jobsByUnitAndProduct = groupJobsByUnitAndProduct(allJobs);

  // 7. Check each job (parallelized for performance)
  const PARALLEL_BATCH_SIZE = 10; // Process jobs in parallel batches to avoid overwhelming resources

  const proposals: JobOptimizationProposal[] = [];

  // Process jobs in parallel batches
  for (let i = 0; i < jobsToCheck.length; i += PARALLEL_BATCH_SIZE) {
    const batch = jobsToCheck.slice(i, i + PARALLEL_BATCH_SIZE);

    const batchProposals = await Promise.all(
      batch.map((job) => {
        const regNumber = job.stocks[0]?.product?.registrationNumber ?? '';
        const productName = job.stocks[0]?.product?.name ?? '';
        const unitProductKey = `${job.productionUnitId}|${regNumber || productName}`;
        const allJobsForProductOnUnit = jobsByUnitAndProduct.get(unitProductKey) ?? [];

        return createJobProposal(
          job,
          allJobsForProductOnUnit,
          compatibilityResults,
          userNotesRules,
          userNotesWarnings,
          labelByRegNumber,
          labelByProductName,
          revokedViolations,
        );
      }),
    );

    proposals.push(...batchProposals);

    // Log progress after each batch
    if (hasContext(context)) {
      const progress = Math.round(((i + batch.length) / jobsToCheck.length) * 100);
      logger.logProgress({
        jobId: context.jobId,
        userId: context.userId,
        progress,
        phase: 'Verifica interventi',
      });
    }
  }

  // 8. Cross-job validation checks
  // Rules compliance runs first (extracts disciplinare info needed by SA group checker)
  // Buffer zone runs in parallel with rules compliance
  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: 'Avvio controlli cross-job (disciplinari, gruppi SA, fasce rispetto)...',
    });
  }

  // 8a. Run buffer zone + rules compliance in parallel
  const emptyRulesResult = {
    violations: new Map<string, ConformityViolation[]>(),
    disciplinareInfoMap: new Map(),
    resolvedCropNames: new Map(),
  };

  const [bufferZoneResult, rulesResult] = await Promise.all([
    checkBufferZoneDoseConformity(
      jobsToCheck,
      fieldDataByUnit,
      labelByRegNumber,
      labelByProductName,
      context,
      historyManager,
    ),
    derivedCompanyId && !input.skipRulesCompliance
      ? checkRulesCompliance(
          jobsToCheck,
          labelByRegNumber,
          labelByProductName,
          derivedCompanyId,
          context,
          historyManager,
        )
      : Promise.resolve(emptyRulesResult),
  ]);

  const rulesViolations = rulesResult.violations;

  // 8b. SA group check uses disciplinare info from rules compliance (avoids duplicate RAG queries)
  const saGroupViolations = derivedCompanyId
    ? await checkSAGroupLimits(
        allJobs,
        labelByRegNumber,
        labelByProductName,
        rulesResult.disciplinareInfoMap,
        historyManager,
      )
    : new Map<string, ConformityViolation[]>();

  console.log(
    `[CONFORMITY-CHECKER] Cross-job checks: buffer zone ${bufferZoneResult.violations.size} violations, SA group ${saGroupViolations.size} violations, rules ${rulesViolations.size} violations`,
  );

  if (hasContext(context)) {
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Controlli cross-job completati: ${bufferZoneResult.violations.size + saGroupViolations.size + rulesViolations.size} violazioni trovate`,
      metadata: {
        bufferZoneViolations: bufferZoneResult.violations.size,
        saGroupViolations: saGroupViolations.size,
        rulesViolations: rulesViolations.size,
      },
    });
  }

  // 9. Merge cross-job violations into proposals
  const mergedProposals = proposals.map((proposal) => {
    const additionalViolations: ConformityViolation[] = [];

    const bufferViolations = bufferZoneResult.violations.get(proposal.jobId);
    if (bufferViolations) additionalViolations.push(...bufferViolations);

    const saViolations = saGroupViolations.get(proposal.jobId);
    if (saViolations) additionalViolations.push(...saViolations);

    const rulesViols = rulesViolations.get(proposal.jobId);
    if (rulesViols) additionalViolations.push(...rulesViols);

    if (additionalViolations.length === 0) return proposal;

    const allViolations = [...proposal.violations, ...additionalViolations];
    const hasErrors = allViolations.some((v) => v.severity === 'ERROR');
    const shouldExclude =
      proposal.shouldExclude ||
      additionalViolations.some((v) => v.type === 'SA_GROUP_LIMIT_EXCEEDED');

    return {
      ...proposal,
      violations: allViolations,
      isConform: !hasErrors,
      shouldExclude,
      exclusionReason:
        shouldExclude && !proposal.shouldExclude
          ? additionalViolations.find((v) => v.type === 'SA_GROUP_LIMIT_EXCEEDED')?.message
          : proposal.exclusionReason,
      proposedValues:
        shouldExclude && !proposal.shouldExclude
          ? { ...proposal.proposedValues, quantity: 0 }
          : proposal.proposedValues,
    };
  });

  // 10. Enrich proposals with alert notes and stock info
  const enrichedProposals = await enrichProposalsWithAlertNotes(
    mergedProposals,
    allJobs,
    labelByRegNumber,
    labelByProductName,
  );

  // 9. Calculate summary
  const elapsed = Date.now() - startTime;
  console.log(`[CONFORMITY-CHECKER] Check completed in ${elapsed}ms`);

  const summary = calculateSummary(
    allJobs.length,
    alreadyCheckedJobs.length,
    jobsToCheck.length,
    enrichedProposals,
  );

  if (hasContext(context)) {
    logger.logTiming({
      jobId: context.jobId,
      userId: context.userId,
      phase: 'conformity-check',
      duration: elapsed,
    });
    logger.logFlow({
      jobId: context.jobId,
      userId: context.userId,
      message: `Controllo conformità completato: ${summary.conformJobs} conformi, ${summary.nonConformJobs} non conformi, ${summary.jobsToExclude} da escludere`,
      metadata: summary,
    });
  }

  return {
    jobGroupId: input.jobGroupId,
    proposals: enrichedProposals,
    summary,
    userNotesAnalysis,
    warnings: systemWarnings.length > 0 ? systemWarnings : undefined,
    checkedAt: new Date(),
  };
}

/**
 * Computes stock aggregates for all products in proposals
 */
async function computeStockAggregates(
  proposals: ReadonlyArray<JobOptimizationProposal>,
  jobById: Map<string, JobWithRelations>,
): Promise<{
  totalRequiredByProductId: Map<string, number>;
  quantityUnitByProductId: Map<string, string>;
  availableStockByProductId: Map<string, number>;
}> {
  const totalRequiredByProductId = new Map<string, number>();
  const quantityUnitByProductId = new Map<string, string>();
  const companyIdByProductId = new Map<string, string>();

  for (const proposal of proposals) {
    const job = jobById.get(proposal.jobId);
    if (!job) continue;

    const stock = job.stocks[0];
    const product = stock?.product as unknown as
      | { id: string; warehouse?: { companyId?: string } }
      | undefined;
    if (!product) continue;

    const finalQuantity = proposal.shouldExclude ? 0 : proposal.proposedValues.quantity;
    totalRequiredByProductId.set(
      product.id,
      (totalRequiredByProductId.get(product.id) ?? 0) + finalQuantity,
    );

    if (!quantityUnitByProductId.has(product.id)) {
      quantityUnitByProductId.set(product.id, job.unitOfMeasureQuantity);
    }

    const companyId = product.warehouse?.companyId;
    if (companyId && !companyIdByProductId.has(product.id)) {
      companyIdByProductId.set(product.id, companyId);
    }
  }

  const availableStockByProductId = new Map<string, number>();
  for (const [productId, companyId] of companyIdByProductId.entries()) {
    const aggregated = await calculateAggregatedStock(prisma, { productId, companyId });
    availableStockByProductId.set(productId, aggregated.availableStock);
  }

  return { totalRequiredByProductId, quantityUnitByProductId, availableStockByProductId };
}

/**
 * Builds update data for an excluded job (pure function, no DB calls)
 */
function buildExcludedJobUpdateData(
  proposal: JobOptimizationProposal,
  job: JobWithRelations,
  alertNotes: unknown,
): Prisma.JobUpdateInput {
  const treatedSurfaceHa = job.productionUnit.areaHa;
  const finalNote =
    `[ESCLUSO] ${proposal.exclusionReason ?? 'Non conforme'}. ${proposal.proposedValues.note ?? ''}`.trim();

  return {
    quantity: 0,
    conformityChecked: true,
    note: finalNote,
    treatedSurface: treatedSurfaceHa,
    productQuantityTreated: treatedSurfaceHa,
    unitOfMeasureProductQuantityTreated: treatedSurfaceHa ? 'ha' : null,
    alertNotes: alertNotes as Prisma.InputJsonValue,
  };
}

/**
 * Builds update data for a conform job (pure function, no DB calls)
 */
function buildConformJobUpdateData(
  proposal: JobOptimizationProposal,
  job: JobWithRelations,
  finalNote: string,
  alertNotes: unknown,
): Prisma.JobUpdateInput {
  const treatedSurfaceHa = job.productionUnit.areaHa;

  return {
    quantity: proposal.proposedValues.quantity,
    unitOfMeasureQuantity: proposal.proposedValues.unitOfMeasureQuantity,
    conformityChecked: true,
    treatedSurface: treatedSurfaceHa,
    productQuantityTreated: treatedSurfaceHa,
    unitOfMeasureProductQuantityTreated: treatedSurfaceHa ? 'ha' : null,
    note: finalNote,
    alertNotes: alertNotes as Prisma.InputJsonValue,
  };
}

/**
 * Confirms and applies optimization proposals.
 * Uses a batch transaction to ensure atomicity — either all jobs update or none do.
 */
export async function confirmConformityCheck(
  input: ConfirmConformityCheckInput,
): Promise<ConfirmConformityCheckOutput> {
  console.log(`[CONFORMITY-CHECKER] Confirming proposals for jobGroupId: ${input.jobGroupId}`);
  console.log(`[CONFORMITY-CHECKER] Proposals to apply: ${input.proposals.length}`);

  const proposalsToApply = input.jobIds
    ? input.proposals.filter((p) => input.jobIds!.includes(p.jobId))
    : input.proposals;

  console.log(`[CONFORMITY-CHECKER] Filtered proposals: ${proposalsToApply.length}`);

  // Load jobs and compute stock aggregates
  const jobById = await loadJobsForConfirmation(input.jobGroupId);
  const { totalRequiredByProductId, quantityUnitByProductId, availableStockByProductId } =
    await computeStockAggregates(proposalsToApply, jobById);

  // Phase 1: Pre-compute all update data (outside transaction)
  const updateOperations: Array<{
    proposal: JobOptimizationProposal;
    updateData: Prisma.JobUpdateInput;
    jobResult: JobConfirmationResult;
  }> = [];
  const precomputeErrors: JobConfirmationResult[] = [];

  for (const proposal of proposalsToApply) {
    try {
      const existingJob = jobById.get(proposal.jobId) ?? null;
      if (!existingJob) {
        throw new Error(`Job ${proposal.jobId} not found`);
      }

      const jobWithRelations = existingJob;
      const treatedSurfaceHa = jobWithRelations.productionUnit.areaHa;
      const stock = jobWithRelations.stocks[0];
      const product = stock?.product;
      const productId = product?.id ?? null;
      const productName = proposal.productName || product?.name || '';
      const regNumberFromDb = product?.registrationNumber ?? null;
      const quantityUnit = productId ? quantityUnitByProductId.get(productId) ?? null : null;
      const totalStockRequiredForJobs = productId
        ? totalRequiredByProductId.get(productId) ?? null
        : null;
      const stockInWarehouse = productId ? availableStockByProductId.get(productId) ?? null : null;

      const labelExtraction = await loadLabelForJob({
        registrationNumber: regNumberFromDb || proposal.registrationNumber,
        productName,
      });
      const label = extractLabelFromExtraction(labelExtraction);
      const effectiveRegistrationNumber =
        (proposal.registrationNumber ?? '').trim() ||
        (regNumberFromDb ?? '').trim() ||
        (labelExtraction?.registrationNumber ?? '').trim();

      const alertNotes = await buildConformityAlertNotes({
        label,
        job: jobWithRelations,
        registrationNumber: effectiveRegistrationNumber,
        productId,
        productName,
        stockInWarehouse,
        stockInWarehouseUm: quantityUnit,
        totalStockRequiredForJobs,
        totalStockRequiredForJobsUm: quantityUnit,
      });

      if (proposal.shouldExclude) {
        const updateData = buildExcludedJobUpdateData(proposal, jobWithRelations, alertNotes);
        updateOperations.push({
          proposal,
          updateData,
          jobResult: {
            jobId: proposal.jobId,
            productName: proposal.productName,
            productionUnitId: proposal.productionUnitId,
            status: 'excluded',
            wasExcluded: true,
            finalQuantity: 0,
            originalQuantity: proposal.originalValues.quantity,
            unitOfMeasure: proposal.originalValues.unitOfMeasureQuantity,
            note: `[ESCLUSO] ${proposal.exclusionReason ?? 'Non conforme'}`,
          },
        });
      } else {
        const finalNote = buildConformityNote({
          productName,
          quantity: proposal.proposedValues.quantity,
          unitOfMeasureQuantity: proposal.proposedValues.unitOfMeasureQuantity,
          treatedSurfaceHa,
          existingNote: null,
          proposedNote: proposal.proposedValues.note,
          stockInWarehouse,
          totalStockRequired: totalStockRequiredForJobs,
        });

        const updateData = buildConformJobUpdateData(
          proposal,
          jobWithRelations,
          finalNote,
          alertNotes,
        );
        updateOperations.push({
          proposal,
          updateData,
          jobResult: {
            jobId: proposal.jobId,
            productName: proposal.productName,
            productionUnitId: proposal.productionUnitId,
            status: 'updated',
            wasExcluded: false,
            finalQuantity: proposal.proposedValues.quantity,
            originalQuantity: proposal.originalValues.quantity,
            unitOfMeasure: proposal.proposedValues.unitOfMeasureQuantity,
            note: finalNote,
          },
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[CONFORMITY-CHECKER] Error preparing update for job ${proposal.jobId}:`,
        error,
      );
      precomputeErrors.push({
        jobId: proposal.jobId,
        productName: proposal.productName,
        productionUnitId: proposal.productionUnitId,
        status: 'error',
        wasExcluded: false,
        finalQuantity: proposal.originalValues.quantity,
        originalQuantity: proposal.originalValues.quantity,
        unitOfMeasure: proposal.originalValues.unitOfMeasureQuantity,
        errorMessage,
      });
    }
  }

  // Phase 2: Execute all updates atomically
  let jobResults: JobConfirmationResult[] = [];
  let updatedCount = 0;
  let excludedCount = 0;
  let errorCount = precomputeErrors.length;

  if (updateOperations.length > 0) {
    try {
      await prisma.$transaction(
        updateOperations.map(({ proposal, updateData }) =>
          prisma.job.update({ where: { id: proposal.jobId }, data: updateData }),
        ),
      );

      // All succeeded
      for (const op of updateOperations) {
        jobResults.push(op.jobResult);
        updatedCount++;
        if (op.jobResult.wasExcluded) excludedCount++;
        console.log(
          `[CONFORMITY-CHECKER] Job ${op.proposal.jobId} ${op.jobResult.wasExcluded ? 'excluded' : 'updated'}`,
        );
      }
    } catch (error) {
      // All rolled back
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CONFORMITY-CHECKER] Transaction failed, all updates rolled back:`, error);

      errorCount += updateOperations.length;
      for (const op of updateOperations) {
        jobResults.push({
          ...op.jobResult,
          status: 'error',
          errorMessage: `Transazione fallita: ${errorMessage}`,
        });
      }
    }
  }

  // Add pre-compute errors
  jobResults = [...jobResults, ...precomputeErrors];

  const updatedJobIds = jobResults.filter((r) => r.status !== 'error').map((r) => r.jobId);

  console.log(
    `[CONFORMITY-CHECKER] Confirmed ${updatedCount} jobs, ${excludedCount} excluded, ${errorCount} errors`,
  );

  return {
    jobGroupId: input.jobGroupId,
    updatedJobsCount: updatedCount,
    excludedJobsCount: excludedCount,
    errorCount,
    updatedJobIds,
    jobResults,
  };
}
