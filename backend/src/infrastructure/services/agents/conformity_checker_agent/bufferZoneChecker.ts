/**
 * Buffer Zone Dose Conformity Checker
 *
 * Reduces treatable area based on field buffer zones (fasce di rispetto)
 * and re-validates dose/ha against label limits using the adjusted area.
 */

import {
  extractFieldBufferZones,
  calculateAdjustedTreatableArea,
} from '../dosage_agent/fieldBufferZoneExtractor';
import {
  ConformityViolation,
  JobWithRelations,
  FieldDataForConformity,
  ProductWithLabel,
} from './types';
import {
  findLabelForProduct,
  extractLabelFromExtraction,
  findMatchingDoseDetail,
} from './matchers';
import { ConformityCheckerContext, toDosageAgentContext } from './context';
import {
  ConformityCheckStep,
  ConformityDataSource,
  type JobHistoryManager,
} from './historyCollector';

// MIN_TREATABLE_AREA_HA is now encapsulated in calculateAdjustedTreatableArea

/**
 * Checks buffer zone dose conformity for all jobs.
 *
 * For each production unit that has bufferZoneNotes on its field:
 * 1. Extracts buffer zones (via LLM, cached)
 * 2. Calculates adjusted treatable area
 * 3. Re-validates dose/ha against label limits with the reduced area
 * 4. Generates BUFFER_ZONE_DOSE_EXCEEDED violations if dose exceeds max
 *
 * Returns adjusted area map + violations keyed by jobId.
 */
export async function checkBufferZoneDoseConformity(
  jobs: JobWithRelations[],
  fieldDataByUnit: Map<string, FieldDataForConformity>,
  labelByRegNumber: Map<string, ProductWithLabel['label']>,
  labelByProductName: Map<string, ProductWithLabel['label']>,
  context?: ConformityCheckerContext,
  historyManager?: JobHistoryManager,
): Promise<{
  adjustedAreaByUnit: Map<string, number>;
  violations: Map<string, ConformityViolation[]>;
}> {
  const adjustedAreaByUnit = new Map<string, number>();
  const violationsByJobId = new Map<string, ConformityViolation[]>();

  // Collect unique units that have buffer zone notes
  const unitsWithBufferZones = new Map<
    string,
    { areaHa: number; fieldData: FieldDataForConformity }
  >();
  for (const job of jobs) {
    const fieldData = fieldDataByUnit.get(job.productionUnitId);
    if (!fieldData?.bufferZoneNotes?.trim()) continue;
    if (unitsWithBufferZones.has(job.productionUnitId)) continue;

    unitsWithBufferZones.set(job.productionUnitId, {
      areaHa: job.productionUnit.areaHa,
      fieldData,
    });
  }

  if (unitsWithBufferZones.size === 0) {
    return { adjustedAreaByUnit, violations: violationsByJobId };
  }

  console.log(
    `[BUFFER-ZONE-CHECKER] Processing ${unitsWithBufferZones.size} units with buffer zone notes`,
  );

  const dosageContext = toDosageAgentContext(context);

  // Extract buffer zones for each unique unit (dedup by notes)
  const noteToResult = new Map<string, number>();

  for (const [unitId, { areaHa, fieldData }] of unitsWithBufferZones) {
    const notes = fieldData.bufferZoneNotes!.trim();
    let bufferAreaHa: number;

    if (noteToResult.has(notes)) {
      bufferAreaHa = noteToResult.get(notes)!;
    } else {
      try {
        const bufferResult = await extractFieldBufferZones(notes, dosageContext);
        bufferAreaHa = bufferResult.area_totale_non_trattabile_ha;
        noteToResult.set(notes, bufferAreaHa);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.warn(
          `[BUFFER-ZONE-CHECKER] Failed to extract buffer zones for unit ${unitId}:`,
          errorMsg,
        );
        // Surface the failure as a warning violation for all jobs on this unit
        for (const j of jobs) {
          if (j.productionUnitId !== unitId) continue;
          if (!violationsByJobId.has(j.id)) violationsByJobId.set(j.id, []);
          violationsByJobId.get(j.id)!.push({
            type: 'BUFFER_ZONE_EXTRACTION_FAILED',
            message: `Impossibile estrarre fasce di rispetto per unità "${unitId}". Il controllo buffer zone non è stato effettuato.`,
            severity: 'WARNING',
            source: 'SYSTEM',
            field: 'buffer_zone',
          });
        }
        continue;
      }
    }

    if (bufferAreaHa <= 0) continue;

    // Calculate adjusted area using shared utility
    const { adjustedAreaHa: adjustedArea, wasReduced } = calculateAdjustedTreatableArea({
      currentAreaHa: areaHa,
      sauHa: fieldData.sauHa,
      bufferAreaHa,
    });

    if (!wasReduced) continue;

    adjustedAreaByUnit.set(unitId, adjustedArea);

    console.log(
      `[BUFFER-ZONE-CHECKER] Unit ${unitId}: area ${areaHa}ha -> adjusted ${adjustedArea.toFixed(4)}ha (buffer: ${bufferAreaHa.toFixed(4)}ha)`,
    );
  }

  // Re-validate dose/ha for jobs on units with reduced area
  for (const job of jobs) {
    const adjustedArea = adjustedAreaByUnit.get(job.productionUnitId);
    if (!adjustedArea || adjustedArea >= job.productionUnit.areaHa) continue;

    // Recalculate dose with adjusted area
    const dosePerHa = adjustedArea > 0 ? job.quantity / adjustedArea : 0;
    if (dosePerHa <= 0) continue;

    // Get label for dose limits
    const product = job.stocks[0]?.product;
    if (!product) continue;

    const regNumber = product.registrationNumber ?? '';
    const productName = product.name ?? '';

    const labelExtraction = findLabelForProduct(
      regNumber,
      productName,
      labelByRegNumber as Map<string, ProductWithLabel['label']>,
      labelByProductName as Map<string, ProductWithLabel['label']>,
    );
    const label = extractLabelFromExtraction(labelExtraction);
    if (!label) continue;

    const doseDetail = findMatchingDoseDetail(
      label,
      job.productionCycle?.cropName,
      job.productionCycle?.variety,
    );
    if (!doseDetail?.dose_massima) continue;

    if (dosePerHa > doseDetail.dose_massima) {
      const violation: ConformityViolation = {
        type: 'BUFFER_ZONE_DOSE_EXCEEDED',
        message: `Con area ridotta per fasce di rispetto (${adjustedArea.toFixed(2)} ha invece di ${job.productionUnit.areaHa.toFixed(2)} ha), la dose effettiva è ${dosePerHa.toFixed(2)} ${job.unitOfMeasureQuantity}/ha, che supera il massimo ${doseDetail.dose_massima} ${doseDetail.dose_um}`,
        severity: 'WARNING',
        source: 'LABEL',
        field: 'buffer_zone_dose',
        currentValue: dosePerHa,
        expectedValue: doseDetail.dose_massima,
      };

      if (!violationsByJobId.has(job.id)) violationsByJobId.set(job.id, []);
      violationsByJobId.get(job.id)!.push(violation);

      if (historyManager) {
        historyManager.addEntry(
          job.productionUnitId,
          `${productName}|${regNumber}`,
          'Dose eccede limite con area ridotta per buffer zone',
          `${dosePerHa.toFixed(2)}/${doseDetail.dose_massima} ${doseDetail.dose_um}/ha`,
          ConformityCheckStep.BUFFER_ZONE_CHECK,
          ConformityDataSource.BUFFER_ZONE_LLM,
          {
            productionUnitId: job.productionUnitId,
            productName,
          },
        );
      }
    }
  }

  return { adjustedAreaByUnit, violations: violationsByJobId };
}
