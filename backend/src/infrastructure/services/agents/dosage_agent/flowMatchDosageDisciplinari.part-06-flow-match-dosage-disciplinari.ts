import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { checkRevocationWithFallback } from './disciplinariRevocationChecker';
import { DoseSearchContext, FlowMatchDosageDisciplinariParams, NormalizedUnit, RegionSource, buildProductKey, treatmentUnitMatches } from './flowMatchDosageDisciplinari.part-01-usage-logger';
import { extractUnitId, fetchDisciplinariEntries, selectDoseLimit } from './flowMatchDosageDisciplinari.part-03-select-dose-limit';
import { resolveUnitRegion } from './flowMatchDosageDisciplinari.part-04-region-lookup-service';
import { annotateTreatmentNote, appendHistoryNote, buildHistoryMetadata, cloneTreatments, resolveUnitAddress } from './flowMatchDosageDisciplinari.part-05-resolve-unit-address';
import { buildEnrichedQueryContext, extractDiseasesFromLabel } from './flowMatchDosageDisciplinari.part-02-extract-diseases-from-label';

export const flowMatchDosageDisciplinari = async (
  params: FlowMatchDosageDisciplinariParams,
): Promise<ReadonlyArray<UnitAllowedProductsWithDosageOutput>> => {
  const { units, normalizedUnits, historyManager, disciplinariContext } = params;
  console.log(
    `[DISCIPLINARI] Avvio ottimizzazione disciplinari per ${units.length} unità produttive`,
  );
  const normalizedMap = new Map<string, NormalizedUnit>();
  normalizedUnits.forEach((unit) => {
    const unitId = extractUnitId(unit);
    if (unitId) {
      normalizedMap.set(unitId, unit);
    }
  });

  const optimizedUnits: UnitAllowedProductsWithDosageOutput[] = [];
  for (const unit of units) {
    const normalizedUnit = normalizedMap.get(unit.unitProductionId);
    const regionInfo = await resolveUnitRegion(unit.unitProductionId, normalizedUnit);
    if (!regionInfo.regionLabel) {
      console.warn(
        `[DISCIPLINARI] Regione non determinata per unità ${unit.unitProductionId}. Verrà saltata la verifica disciplinari.`,
      );
    }
    const optimizedProducts: Array<UnitAllowedProductsWithDosageOutput['products'][number]> = [];
    for (const product of unit.products || []) {
      const productName = String((product as { name?: string }).name || '');
      const regNumber = String((product as { regNumber?: string }).regNumber || '');
      const productKey = buildProductKey(productName, regNumber);
      if (!productName || !regNumber) {
        optimizedProducts.push(product);
        continue;
      }
      if (!product.trattamenti || product.trattamenti.length === 0) {
        optimizedProducts.push(product);
        continue;
      }
      if (!regionInfo.regionLabel || !regionInfo.normalizedRegion) {
        optimizedProducts.push(product);
        continue;
      }
      if (regionInfo.source === RegionSource.COMPANY_GEOCODED) {
        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Regione disciplinare risolta da azienda',
          regionInfo.regionLabel,
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          DataSource.USER_INPUT,
          {
            ...buildHistoryMetadata(unit, product),
            companyName: regionInfo.companyName,
            description: 'Regione derivata tramite geocoding indirizzo aziendale',
          },
        );
      }
      const disciplinariEntries = await fetchDisciplinariEntries(productName, regNumber);
      if (disciplinariEntries.length === 0) {
        optimizedProducts.push(product);
        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Prodotto non presente nei disciplinari BDF',
          'Nessun record trovato',
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          DataSource.BDF_DATABASE,
          buildHistoryMetadata(unit, product),
        );
        continue;
      }

      // Check revocation status for the product
      const treatmentDates = (product.trattamenti || [])
        .map((t) => t.data_distribuzione)
        .filter((d): d is Date => d instanceof Date);
      const earliestApplicationDate =
        treatmentDates.length > 0
          ? new Date(Math.min(...treatmentDates.map((d) => d.getTime())))
          : new Date();

      const revocationStatus = await checkRevocationWithFallback(
        productName,
        regNumber,
        earliestApplicationDate,
        disciplinariEntries,
        regionInfo.normalizedRegion,
      );

      // If product is revoked/expired, set dose to 0, annotate treatments and log to history
      if (revocationStatus.isRevoked) {
        const clonedTreatmentsForRevocation = cloneTreatments(product.trattamenti);
        clonedTreatmentsForRevocation.forEach((treatment) => {
          treatment.dose = 0; // Set quantity to zero for revoked products
          annotateTreatmentNote(treatment, `[REVOCA] ${revocationStatus.reason}`);
        });

        // Determine the appropriate DataSource based on revocation source
        const revocationDataSource =
          revocationStatus.source === 'ministerial_dataset'
            ? DataSource.MINISTERIAL_DATASET
            : revocationStatus.source === 'tavily_search'
              ? DataSource.TAVILY_SEARCH
              : DataSource.BDF_DATABASE;

        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Prodotto revocato o scaduto',
          revocationStatus.reason,
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          revocationDataSource,
          {
            ...buildHistoryMetadata(unit, product),
            description: revocationStatus.sourceUrl
              ? `Fonte: ${revocationStatus.sourceUrl}`
              : `Fonte: ${revocationStatus.source}`,
          },
        );

        console.log(
          `[DISCIPLINARI] Prodotto ${productName} (${regNumber}) risulta revocato/scaduto: ${revocationStatus.reason}`,
        );

        // Keep product but with revocation annotation
        optimizedProducts.push({
          ...product,
          trattamenti: clonedTreatmentsForRevocation as ReadonlyArray<
            NonNullable<
              UnitAllowedProductsWithDosageOutput['products'][number]['trattamenti']
            >[number]
          >,
        });
        continue;
      }

      const unitAddress =
        regionInfo.address ?? (await resolveUnitAddress(unit.unitProductionId, normalizedUnit));
      const diseases = extractDiseasesFromLabel(product);
      const searchContext: DoseSearchContext = {
        diseases,
        agronomicNotes: disciplinariContext?.agronomicNotes,
        priorityTargets: disciplinariContext?.priorityTargets,
      };
      const enrichedContext = buildEnrichedQueryContext(searchContext);
      if (enrichedContext) {
        console.log(
          `[DISCIPLINARI] Contesto ricerca (${productName} ${regNumber}): ${enrichedContext}`,
        );
      }
      const historyMetadata = buildHistoryMetadata(unit, product);
      const baseDescription = historyMetadata?.description;
      const contextAwareMetadata = enrichedContext
        ? {
            ...historyMetadata,
            description: baseDescription
              ? `${baseDescription}. Context: ${enrichedContext}`
              : `Context: ${enrichedContext}`,
          }
        : historyMetadata;
      const limit = await selectDoseLimit(
        disciplinariEntries,
        regionInfo.normalizedRegion,
        unitAddress,
        historyManager,
        unit.unitProductionId,
        productKey,
        contextAwareMetadata,
        searchContext,
      );
      if (!limit || limit.maxDose === undefined) {
        optimizedProducts.push(product);
        historyManager?.addEntry(
          unit.unitProductionId,
          productKey,
          'Disciplinare disponibile ma senza limiti di dose per la regione',
          regionInfo.regionLabel ?? 'N/A',
          DosageAgentStep.DISCIPLINARI_VALIDATION,
          DataSource.BDF_DATABASE,
          contextAwareMetadata,
        );
        continue;
      }
      const clonedTreatments = cloneTreatments(product.trattamenti);
      let adjustments = 0;
      clonedTreatments.forEach((treatment, index) => {
        if (typeof treatment.dose !== 'number') {
          return;
        }
        if (!treatmentUnitMatches(treatment.dosaggio_um, limit.unitOfMeasure)) {
          return;
        }
        if (treatment.dose > (limit.maxDose ?? Number.POSITIVE_INFINITY)) {
          const previousDose = treatment.dose;
          treatment.dose = limit.maxDose!;
          annotateTreatmentNote(
            treatment,
            `[DISCIPLINARE] Dose ridotta da ${previousDose} a ${limit.maxDose} ${limit.unitOfMeasure || treatment.dosaggio_um || ''}`,
          );
          adjustments += 1;
          appendHistoryNote(
            historyManager,
            unit.unitProductionId,
            productKey,
            `Applicazione #${index + 1} adeguata al disciplinare`,
            `${previousDose} → ${limit.maxDose} ${limit.unitOfMeasure || treatment.dosaggio_um || ''}`,
            {
              ...contextAwareMetadata,
              description: `Regione: ${regionInfo.regionLabel || 'N/A'}. Fonte disciplina: ${limit.regionLabel || 'N/A'}.`,
            },
          );
        }
      });
      if (adjustments > 0) {
        console.log(
          `[DISCIPLINARI] Ridotte ${adjustments} applicazioni per prodotto ${productName} (${regNumber}) sull'unità ${unit.unitProductionId}`,
        );
      }
      optimizedProducts.push({
        ...product,
        trattamenti: clonedTreatments as ReadonlyArray<
          NonNullable<
            UnitAllowedProductsWithDosageOutput['products'][number]['trattamenti']
          >[number]
        >,
      });
    }
    optimizedUnits.push({
      ...unit,
      products: optimizedProducts,
    });
  }
  return optimizedUnits;
};
