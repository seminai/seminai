import { ConformityCheckerContext, hasContext } from './context';
import { DosageLoggerService } from '../../dosage-logger.service';
import { Label, LabelDoseDetail } from '../../../../domain/dtos/label.dto';
import { extractLabelFromExtraction, findLabelForProduct } from './matchers';
import { enrichDosageDetailsFromBdf } from '../dosage_agent/bdfDosageEnricher';
import { loadJobsByGroupId, loadLabelsForProducts } from './loaders';

export async function enrichIncompleteLabels(params: {
  readonly allJobs: LoadedConformityJobs;
  readonly labelByRegNumber: LoadedConformityLabels['labelByRegNumber'];
  readonly labelByProductName: LoadedConformityLabels['labelByProductName'];
  readonly context?: ConformityCheckerContext;
  readonly logger: ReturnType<typeof DosageLoggerService.getInstance>;
  readonly systemWarnings: string[];
}): Promise<void> {
  const { allJobs, labelByRegNumber, labelByProductName, context, logger, systemWarnings } = params;
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

export type LoadedConformityJobs = Awaited<ReturnType<typeof loadJobsByGroupId>>;

export type LoadedConformityLabels = Awaited<ReturnType<typeof loadLabelsForProducts>>;
