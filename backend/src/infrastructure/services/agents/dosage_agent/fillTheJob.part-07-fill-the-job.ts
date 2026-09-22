import { UnitScheduledJob } from './flowMatchCropTreatment';
import { prisma } from '../../../repositories/Prisma';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { roundQuantity, getEffectiveAreaHa } from './unitConversion';
import { parseProductName } from '../../../services/utils/ProductNameParser';
import { calculateAggregatedStock } from './stockAggregator';
import { FillTheJobInput, FillTheJobOutput, extractLabelFromProduct, normalizeRegistrationNumber } from './fillTheJob.part-01-requested-product';
import { createExcludedProductJobs, initializeFillRuntime } from './fillTheJob.part-06-create-excluded-product-jobs';
import { extractIncomingStock, resolveProductionUnitMetadata } from './fillTheJob.part-02-format-rule-violations-as-text';
import { createIncomingStockMovement, findOrCreateProduct } from './fillTheJob.part-03-find-or-create-product';
import { processProductTreatments } from './fillTheJob.part-05-process-product-treatments';

export const fillTheJob = async (input: FillTheJobInput): Promise<FillTheJobOutput> => {
  const runtime = await initializeFillRuntime(input);
  const {
    stockRepository,
    createJobUseCase,
    jobsByUnit,
    productionUnitCache,
    productCache,
    warnings,
    batchLoader,
  } = runtime;

  for (const unit of input.units) {
    const unitJobs: UnitScheduledJob[] = [];
    // Use batch loader for metadata (prevents N+1 queries)
    let metadata = batchLoader.getUnitMetadata(unit.unitProductionId);
    if (!metadata) {
      // Fallback to individual query if not in batch (shouldn't happen normally)
      metadata = await resolveProductionUnitMetadata(
        prisma,
        unit.unitProductionId,
        productionUnitCache,
      );
    }
    // Ensure warehouse exists for company
    if (metadata.companyId && !metadata.warehouseId) {
      const warehouseId = await batchLoader.getOrCreateWarehouse(metadata.companyId);
      if (warehouseId) {
        metadata = { ...metadata, warehouseId };
      }
    }
    const areaHa = typeof unit.areaHa === 'number' ? unit.areaHa : null;
    const areaHaMetadata = typeof unit.areaHa === 'number' ? unit.areaHa : undefined;
    const hasValidAreaHa = typeof areaHa === 'number' && Number.isFinite(areaHa) && areaHa > 0;

    if (!hasValidAreaHa) {
      const warning = `Skipping job creation for unit ${unit.unitProductionId} due to missing or non-positive areaHa`;
      warnings.push(warning);
      console.warn(`[FILL-JOB] ${warning}`);
      if (input.historyManager) {
        input.historyManager.addEntry(
          unit.unitProductionId,
          'unit-areaHa',
          'Job creation skipped: missing areaHa',
          'areaHa is missing or <= 0, no scheduled jobs were created for this unit',
          DosageAgentStep.JOB_CREATION,
          DataSource.USER_INPUT,
          {
            productionUnitId: unit.unitProductionId,
            productionUnitName: metadata.productionUnitName ?? undefined,
            companyId: metadata.companyId ?? undefined,
            companyName: metadata.companyName ?? undefined,
            cropName: String((unit as { cropName?: string }).cropName ?? ''),
            variety: String((unit as { variety?: string }).variety ?? ''),
            areaHa: areaHaMetadata,
            description:
              'Cannot create treatment jobs without a valid treated surface. Provide areaHa > 0 to enable job creation.',
          },
        );
      }
      jobsByUnit.set(unit.unitProductionId, unitJobs);
      continue;
    }

    const productsWithJobs = new Set<string>();

    for (const product of unit.products ?? []) {
      const productName = String((product as { name?: string }).name ?? '').trim();
      const rawRegistrationNumber = String(
        (product as { regNumber?: string }).regNumber ?? '',
      ).trim();
      const normalizedRegistrationNumber = normalizeRegistrationNumber(rawRegistrationNumber);

      if (!Array.isArray((product as { trattamenti?: unknown }).trattamenti)) {
        console.warn(
          `[FILL-JOB] Product ${productName} (${rawRegistrationNumber}) has no trattamenti array on unit ${unit.unitProductionId} - will create zero-quantity job`,
        );
        continue;
      }

      const effectiveAreaHa = getEffectiveAreaHa({
        unitAreaHa: areaHa,
        treatedAreaHa: (product as { treatedAreaHa?: number }).treatedAreaHa,
        isLocalizedTreatment: (product as { isLocalizedTreatment?: boolean }).isLocalizedTreatment,
      });

      const incomingStock = extractIncomingStock(product);
      const matchedProduct = await findOrCreateProduct(
        prisma,
        {
          name: productName,
          registrationNumber: rawRegistrationNumber || normalizedRegistrationNumber,
          companyId: metadata.companyId,
          warehouseId: metadata.warehouseId,
        },
        productCache,
        warnings,
      );

      if (!matchedProduct) {
        continue;
      }

      if (incomingStock) {
        const parsedForStock = parseProductName(productName);
        try {
          const createdStock = await createIncomingStockMovement(stockRepository, {
            productId: matchedProduct.id,
            quantity: incomingStock.quantity,
            unitOfMeasure: incomingStock.unitOfMeasure,
            productName,
            notes: parsedForStock.baseName !== productName ? productName : null,
            packagingInfo: parsedForStock.packagingInfo,
          });

          // Traccia il caricamento stock IN
          if (input.historyManager) {
            const cropName = String((unit as { cropName?: string }).cropName ?? '');
            const variety = String((unit as { variety?: string }).variety ?? '');
            const productKey = `${productName}|${normalizedRegistrationNumber}`;

            input.historyManager.addEntry(
              unit.unitProductionId,
              productKey,
              `Stock IN: Carico magazzino ${metadata.companyName || 'azienda'}`,
              `${createdStock.quantity} ${createdStock.unitOfMeasureQuantity}`,
              DosageAgentStep.JOB_CREATION,
              DataSource.WAREHOUSE_STOCK,
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
                stockId: createdStock.id,
                stockQuantity: createdStock.quantity,
                stockUnit: createdStock.unitOfMeasureQuantity,
                description: `Movimento di entrata per rifornimento magazzino. Tipo: ${createdStock.type}. Categoria prodotto: ${matchedProduct.category}. SKU: ${matchedProduct.sku}`,
              },
            );
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : 'Unknown error';
          warnings.push(
            `Failed to create incoming stock for product ${productName} on unit ${unit.unitProductionId}: ${errorMsg}`,
          );
        }
      }

      const treatments = (
        product as {
          trattamenti?: ReadonlyArray<{
            readonly data_distribuzione?: string | null;
            readonly dose?: number | null;
            readonly dosaggio_um?: string | null;
            readonly isLocalizedTreatment?: boolean | null;
            readonly note?: string | null;
            readonly application?: string | null;
            readonly epoca_impiego?: string | null;
            readonly fasce_rispetto_acqua?: string | null;
            readonly fasce_rispetto_colture?: string | null;
            readonly ddt_date_is_ok?: boolean | null;
            readonly ddt_date_conformity?: string | null;
            readonly ddt_date_after_treatment?: boolean | null;
          }>;
        }
      ).trattamenti;

      if (!treatments) {
        continue;
      }

      // Estrai la label dal prodotto per costruire alertNotes
      const productLabel = extractLabelFromProduct(product);

      // Calcola il totale richiesto per tutti i trattamenti di questo prodotto
      const totalStockRequiredForProduct = treatments.reduce((acc, t) => {
        if (t && typeof t.dose === 'number') {
          return acc + roundQuantity(t.dose * effectiveAreaHa);
        }
        return acc;
      }, 0);

      // Calcola lo stock disponibile REALE per questa azienda usando la utility centralizzata
      // Stock disponibile = Stock IN - Stock OUT verificati
      // Gli stock OUT da job non verificati NON contano come consumati

      if (!metadata.companyId) {
        warnings.push(`No company found for unit ${unit.unitProductionId}, cannot calculate stock`);
        continue;
      }

      const aggregatedStock = await calculateAggregatedStock(prisma, {
        productId: matchedProduct.id,
        companyId: metadata.companyId,
      });

      const stockInTotal = aggregatedStock.stockInTotal;
      const stockOutVerifiedTotal = aggregatedStock.stockOutVerifiedTotal;
      const initialStockBalance = aggregatedStock.availableStock;

      console.log(
        `[FILL-JOB] Stock ${productName} (productId=${matchedProduct.id}, companyId=${metadata.companyId}): IN=${stockInTotal}, OUT_verified=${stockOutVerifiedTotal}, available=${initialStockBalance}, required=${totalStockRequiredForProduct}, stockOut=${totalStockRequiredForProduct > initialStockBalance ? totalStockRequiredForProduct - initialStockBalance : 'null'}`,
      );
      await processProductTreatments({
        treatments,
        product,
        productName,
        productLabel,
        normalizedRegistrationNumber,
        unit,
        areaHaMetadata,
        effectiveAreaHa,
        totalStockRequiredForProduct,
        metadata,
        matchedProduct,
        input,
        initialStockBalance,
        batchLoader,
        createJobUseCase,
        unitJobs,
        productsWithJobs,
        warnings,
      });
    }

    await createExcludedProductJobs({
      unit,
      productsWithJobs,
      metadata,
      areaHaMetadata,
      input,
      batchLoader,
      createJobUseCase,
      productCache,
      warnings,
      unitJobs,
    });

    jobsByUnit.set(unit.unitProductionId, unitJobs);
  }

  return {
    jobsByUnit,
    warnings,
  };
};
