import { ConformityCheckInput, ConformityCheckOutput } from './types';
import { ConformityCheckerContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { loadJobsByGroupId, loadFieldDataForProductionUnits } from './loaders';
import { createConformityHistoryManager } from './historyCollector';
import { checkRevokedProducts } from './revokedProductChecker';
import { calculateSummary, createEmptyOutput, enrichProposalsWithAlertNotes } from './index.part-02-enrich-proposals-with-alert-notes';
import { checkIngredientCompatibility, processUserNotes } from './index.part-01-process-user-notes';
import { loadConformityLabels } from './index.part-04-load-conformity-labels';
import { createConformityProposals } from './index.part-05-create-conformity-proposals';

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

  const { labelByRegNumber, labelByProductName } = await loadConformityLabels({
    allJobs,
    context,
    logger,
    systemWarnings,
  });

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

  const mergedProposals = await createConformityProposals({
    allJobs,
    jobsToCheck,
    compatibilityResults,
    userNotesRules,
    userNotesWarnings,
    labelByRegNumber,
    labelByProductName,
    revokedViolations,
    fieldDataByUnit,
    derivedCompanyId,
    skipRulesCompliance: input.skipRulesCompliance,
    context,
    historyManager,
    logger,
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
