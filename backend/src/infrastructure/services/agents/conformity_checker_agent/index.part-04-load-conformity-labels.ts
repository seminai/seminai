import { ConformityCheckerContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { loadLabelsForProducts, loadFieldDataForProductionUnits, extractMissingLabels } from './loaders';
import { checkRevokedProducts } from './revokedProductChecker';
import { createConformityHistoryManager } from './historyCollector';
import { LoadedConformityJobs, LoadedConformityLabels, enrichIncompleteLabels } from './index.part-03-enrich-incomplete-labels';
import { checkIngredientCompatibility, processUserNotes } from './index.part-01-process-user-notes';

export async function loadConformityLabels(params: {
  readonly allJobs: LoadedConformityJobs;
  readonly context?: ConformityCheckerContext;
  readonly logger: ReturnType<typeof DosageLoggerService.getInstance>;
  readonly systemWarnings: string[];
}): Promise<LoadedConformityLabels> {
  const { allJobs, context, logger, systemWarnings } = params;
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

await enrichIncompleteLabels({
  allJobs,
  labelByRegNumber,
  labelByProductName,
  context,
  logger,
  systemWarnings,
});
  return { labelByRegNumber, labelByProductName };
}

export interface ConformityProposalParams {
  readonly allJobs: LoadedConformityJobs;
  readonly jobsToCheck: LoadedConformityJobs;
  readonly compatibilityResults: Awaited<ReturnType<typeof checkIngredientCompatibility>>;
  readonly userNotesRules: Awaited<ReturnType<typeof processUserNotes>>['userNotesRules'];
  readonly userNotesWarnings: Awaited<ReturnType<typeof processUserNotes>>['userNotesWarnings'];
  readonly labelByRegNumber: LoadedConformityLabels['labelByRegNumber'];
  readonly labelByProductName: LoadedConformityLabels['labelByProductName'];
  readonly revokedViolations: ReturnType<typeof checkRevokedProducts>['violations'];
  readonly fieldDataByUnit: Awaited<ReturnType<typeof loadFieldDataForProductionUnits>>;
  readonly derivedCompanyId: string | null;
  readonly skipRulesCompliance?: boolean;
  readonly context?: ConformityCheckerContext;
  readonly historyManager: ReturnType<typeof createConformityHistoryManager>;
  readonly logger: ReturnType<typeof DosageLoggerService.getInstance>;
}
