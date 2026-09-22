import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { Label } from '../../../../domain/dtos/label.dto';
import { BatchLoaderContext } from './batchLoader';
import { CreateJobUseCase } from '../../../../application/use-cases/job/CreateJobUseCase';
import { UnitScheduledJob } from './flowMatchCropTreatment';
import { roundQuantity } from './unitConversion';
import { CreateStockProps } from '../../../../domain/dtos/stock.dto';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { buildDisciplinareInfoKey } from './productAccessors';
import { buildAppliedRulesKey } from './flowValidateRulesCompliance';
import { JobCategory } from '@prisma/client';
import { alertNotesToJson, historyToJson } from './typeGuards';
import type { Prisma } from '@prisma/client';
import { prisma } from '../../../repositories/Prisma';
import { FillProductTreatment } from './fillTheJob.part-04-aggregate-requested-products';
import { DEFAULT_PRICE_UNIT, FillTheJobInput, ProductSummary, ProductionUnitMetadata, STOCK_OUT_TYPE, buildAlertNotes, normalizeQuantityUnit, parseDate } from './fillTheJob.part-01-requested-product';
import { mapJob } from './fillTheJob.part-02-format-rule-violations-as-text';

export async function processProductTreatments(params: {
  readonly treatments: ReadonlyArray<FillProductTreatment>;
  readonly product: UnitAllowedProductsWithDosageOutput['products'][number];
  readonly productName: string;
  readonly productLabel: Label | null;
  readonly normalizedRegistrationNumber: string;
  readonly unit: UnitAllowedProductsWithDosageOutput;
  readonly areaHaMetadata?: number;
  readonly effectiveAreaHa: number;
  readonly totalStockRequiredForProduct: number;
  readonly metadata: ProductionUnitMetadata;
  readonly matchedProduct: ProductSummary;
  readonly input: FillTheJobInput;
  readonly initialStockBalance: number;
  readonly batchLoader: BatchLoaderContext;
  readonly createJobUseCase: CreateJobUseCase;
  readonly unitJobs: UnitScheduledJob[];
  readonly productsWithJobs: Set<string>;
  readonly warnings: string[];
}): Promise<void> {
  const { treatments, product, productName, productLabel, normalizedRegistrationNumber, unit, areaHaMetadata, effectiveAreaHa, totalStockRequiredForProduct, metadata, matchedProduct, input, initialStockBalance, batchLoader, createJobUseCase, unitJobs, productsWithJobs, warnings } = params;
  let currentStockBalance = initialStockBalance;
for (const treatment of treatments) {
    if (!treatment) {
      continue;
    }
    const treatmentDate = parseDate(treatment.data_distribuzione ?? null);
    const dosePerHa = typeof treatment.dose === 'number' ? treatment.dose : null;

    if (!treatmentDate || dosePerHa === null) {
      warnings.push(
        `Skipping job creation for product ${productName} on unit ${unit.unitProductionId} due to missing date or dose`,
      );
      continue;
    }

    const quantityUnit = normalizeQuantityUnit(
      treatment.dosaggio_um ??
        (product as { quantityUnitOfMeasure?: string }).quantityUnitOfMeasure ??
        null,
    );
    const totalQuantity = roundQuantity(dosePerHa * effectiveAreaHa);

    const isZeroQuantity = totalQuantity <= 0;
    if (isZeroQuantity) {
      console.log(
        `[FILL-JOB] Creating zero-quantity job for product ${productName} on unit ${unit.unitProductionId} (non-compliant or zero dose)`,
      );
    }

    const stock: CreateStockProps = {
      productId: matchedProduct.id,
      quantity: isZeroQuantity ? 0 : -Math.abs(totalQuantity),
      unitOfMeasureQuantity: quantityUnit,
      price: 0,
      unitOfMeasurePrice: DEFAULT_PRICE_UNIT,
      type: STOCK_OUT_TYPE,
    };

    const treatedSurface = isZeroQuantity ? 0 : effectiveAreaHa;

    // Recupera l'history per questo prodotto e unità produttiva
    const productKey = `${productName}|${normalizedRegistrationNumber}`;
    const history = input.historyManager
      ? input.historyManager.getEntries(unit.unitProductionId, productKey)
      : [];

    // Aggiungi informazioni sulla creazione del Job con metadati completi
    if (input.historyManager && matchedProduct) {
      const cropName = String((unit as { cropName?: string }).cropName ?? '');
      const variety = String((unit as { variety?: string }).variety ?? '');

      input.historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        `Job creato: ${productName} su ${metadata.productionUnitName || 'Unità ' + unit.unitProductionId.slice(0, 8)}`,
        `Trattamento programmato per ${treatmentDate.toISOString().split('T')[0]}`,
        DosageAgentStep.JOB_CREATION,
        DataSource.AUTOMATIC_CALCULATION,
        {
          productionUnitId: unit.unitProductionId,
          productionUnitName: metadata.productionUnitName ?? undefined,
          productId: matchedProduct.id,
          productName: matchedProduct.name,
          productRegistrationNumber: matchedProduct.registrationNumber ?? undefined,
          companyId: metadata.companyId ?? undefined,
          companyName: metadata.companyName ?? undefined,
          cropName,
          variety,
          areaHa: areaHaMetadata,
          stockQuantity: totalQuantity,
          stockUnit: quantityUnit,
          description: `Azienda: ${metadata.companyName || 'N/A'}. Categoria prodotto: ${matchedProduct.category}. Dose: ${dosePerHa} ${quantityUnit}/ha. Superficie: ${treatedSurface ? treatedSurface.toFixed(2) : 'N/A'} ha. ${treatment.isLocalizedTreatment ? 'Trattamento localizzato' : 'Trattamento distribuito'}. ${treatment.note || ''}`,
        },
      );
    }

    const stockInfo = `Disponibile: ${currentStockBalance.toFixed(2)} ${quantityUnit}, Richiesto: ${totalQuantity.toFixed(2)} ${quantityUnit}.`;
    const enrichedNote = [treatment.note, stockInfo].filter(Boolean).join(' ');

    // Costruisci alertNotes con dati dalla label e LLM
    // Lo stock_out è calcolato come: totalStockRequired - initialStockBalance
    // Se hai 50L in magazzino e applichi 60L totali, stock_out = 10L
    const unitCropName = String((unit as { cropName?: string }).cropName ?? '');
    const unitVariety = String((unit as { variety?: string }).variety ?? '');
    // Filter rule violations relevant to this product
    const productActiveIngredient = productLabel?.principio_attivo ?? '';
    const productRuleViolations = (input.ruleViolations ?? []).filter((v) => {
      const descLower = v.description.toLowerCase();
      const nameMatch = productName && descLower.includes(productName.toLowerCase());
      const ingredientMatch =
        productActiveIngredient && descLower.includes(productActiveIngredient.toLowerCase());
      return nameMatch || ingredientMatch;
    });
    // Lookup disciplinare info for this product's active ingredient
    const disciplinareInfo = productActiveIngredient
      ? input.disciplinareInfoMap?.get(
          buildDisciplinareInfoKey(productActiveIngredient, unitCropName),
        ) ?? null
      : null;
    const alertNotes = buildAlertNotes({
      label: productLabel,
      treatment: {
        epoca_impiego: treatment.epoca_impiego ?? null,
        fasce_rispetto_acqua: treatment.fasce_rispetto_acqua ?? null,
        fasce_rispetto_colture: treatment.fasce_rispetto_colture ?? null,
        application: treatment.application ?? null,
        ddt_date_is_ok: treatment.ddt_date_is_ok ?? null,
        ddt_date_conformity: treatment.ddt_date_conformity ?? null,
        ddt_date_after_treatment: treatment.ddt_date_after_treatment ?? null,
      },
      cropName: unitCropName,
      variety: unitVariety,
      totalStockRequired: totalStockRequiredForProduct,
      quantityUnit,
      initialStockBalance,
      treatedSurface,
      ruleViolations: productRuleViolations.length > 0 ? productRuleViolations : undefined,
      disciplinareInfo,
    });

    // Aggiorna il saldo progressivo per il prossimo trattamento (solo se quantità > 0)
    if (!isZeroQuantity) {
      currentStockBalance -= totalQuantity;
    }

    // Resolve cycleId: use provided one or determine automatically from cached data
    const resolvedCycleId = batchLoader.resolveCycleId(
      unit.unitProductionId,
      unit.cycleId,
      treatmentDate,
    );

    const productAppliedRules = productName
      ? input.appliedRulesByProduct?.get(
          buildAppliedRulesKey(unit.unitProductionId, productName),
        ) ?? null
      : null;
    const { job } = await createJobUseCase.execute({
      productionUnitId: unit.unitProductionId,
      productionCycleId: resolvedCycleId,
      jobId: input.queueJobId ?? null,
      dateOfOpeation: treatmentDate,
      category: JobCategory.TREATMENT,
      quantity: totalQuantity,
      unitOfMeasureQuantity: quantityUnit,
      treatedSurface,
      isLocalizedTreatment:
        typeof treatment.isLocalizedTreatment === 'boolean'
          ? treatment.isLocalizedTreatment
          : typeof (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment ===
              'boolean'
            ? (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment
            : null,
      note: enrichedNote || null,
      alertNotes: alertNotesToJson(alertNotes),
      appliedRules: productAppliedRules
        ? (productAppliedRules as unknown as Prisma.JsonValue)
        : null,
      productQuantityTreated: treatedSurface,
      unitOfMeasureProductQuantityTreated: treatedSurface ? 'ha' : null,
      stocks: [stock],
      history: history.length > 0 ? historyToJson(history) : null,
      conformityChecked: true,
      machineId: input.machineId ?? null,
      userId: input.operatorId ?? null,
    });

    const jobWithRelations = await prisma.job.findUnique({
      where: { id: job.id },
      include: {
        stocks: {
          include: {
            product: true,
          },
        },
      },
    });

    // Traccia la creazione dello stock OUT
    if (input.historyManager && jobWithRelations && jobWithRelations.stocks.length > 0) {
      const createdStock = jobWithRelations.stocks[0];
      const cropName = String((unit as { cropName?: string }).cropName ?? '');
      const variety = String((unit as { variety?: string }).variety ?? '');

      input.historyManager.addEntry(
        unit.unitProductionId,
        productKey,
        `Stock OUT: Prelievo magazzino ${metadata.companyName || 'azienda'}`,
        `${Math.abs(createdStock.quantity)} ${createdStock.unitOfMeasureQuantity}`,
        DosageAgentStep.JOB_CREATION,
        DataSource.WAREHOUSE_STOCK,
        {
          productionUnitId: unit.unitProductionId,
          productionUnitName: metadata.productionUnitName ?? undefined,
          productId: matchedProduct?.id,
          productName: matchedProduct?.name,
          productRegistrationNumber: matchedProduct?.registrationNumber ?? undefined,
          companyId: metadata.companyId ?? undefined,
          companyName: metadata.companyName ?? undefined,
          cropName,
          variety,
          areaHa: areaHaMetadata,
          stockId: createdStock.id,
          stockQuantity: createdStock.quantity,
          stockUnit: createdStock.unitOfMeasureQuantity,
          description: `Movimento di uscita per job ${job.id}. Tipo: ${createdStock.type}. Prodotto: ${createdStock.product.name} (${createdStock.product.sku}). Categoria: ${createdStock.product.category}`,
        },
      );
    }

    if (jobWithRelations) {
      unitJobs.push(mapJob(jobWithRelations));
      const pKey = `${productName.toLowerCase()}|${normalizedRegistrationNumber}`;
      productsWithJobs.add(pKey);
    }
  }
}
