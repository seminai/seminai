import { UnitAllowedProductsWithDosageOutput } from './flowMatchProductionUnitTreatmentDosage';
import { BatchLoaderContext } from './batchLoader';
import { CreateJobUseCase } from '../../../../application/use-cases/job/CreateJobUseCase';
import { UnitScheduledJob } from './flowMatchCropTreatment';
import type { ExcludedProduct } from './types';
import { prisma } from '../../../repositories/Prisma';
import { DosageAgentStep, DataSource } from '../../../../domain/dtos/job-history.dto';
import { JobCategory } from '@prisma/client';
import { historyToJson, excludedProductInfoToJson } from './typeGuards';
import { buildAppliedRulesKey } from './flowValidateRulesCompliance';
import type { Prisma } from '@prisma/client';
import { PrismaStockRepository } from '../../../repositories/PrismaStockRepository';
import { PrismaJobRepository } from '../../../repositories/PrismaJobRepository';
import { DEFAULT_PRICE_UNIT, FillTheJobInput, ProductSummary, ProductionUnitMetadata, STOCK_OUT_TYPE, normalizeRegistrationNumber } from './fillTheJob.part-01-requested-product';
import { findOrCreateProduct } from './fillTheJob.part-03-find-or-create-product';
import { mapJob } from './fillTheJob.part-02-format-rule-violations-as-text';
import { ensureWarehouseStockForRequestedProducts } from './fillTheJob.part-04-aggregate-requested-products';

export async function createExcludedProductJobs(params: {
  readonly unit: UnitAllowedProductsWithDosageOutput;
  readonly productsWithJobs: ReadonlySet<string>;
  readonly metadata: ProductionUnitMetadata;
  readonly areaHaMetadata?: number;
  readonly input: FillTheJobInput;
  readonly batchLoader: BatchLoaderContext;
  readonly createJobUseCase: CreateJobUseCase;
  readonly productCache: Map<string, ProductSummary>;
  readonly warnings: string[];
  readonly unitJobs: UnitScheduledJob[];
}): Promise<void> {
  const { unit, productsWithJobs, metadata, areaHaMetadata, input, batchLoader, createJobUseCase, productCache, warnings, unitJobs } = params;
  // Collect products that passed all filters but generated no treatment jobs
  const droppedProducts: ExcludedProduct[] = [];
  for (const product of unit.products ?? []) {
    const name = String((product as { name?: string }).name ?? '').trim();
    const regNumber = String((product as { regNumber?: string }).regNumber ?? '').trim();
    const normalizedReg = normalizeRegistrationNumber(regNumber);
    const pKey = `${name.toLowerCase()}|${normalizedReg}`;
    if (!productsWithJobs.has(pKey) && name) {
      const productLabel = (product as { label?: unknown }).label;
      const categoria =
        productLabel && typeof productLabel === 'object' && 'categoria' in productLabel
          ? String((productLabel as { categoria?: string }).categoria ?? '')
          : null;
      const specificReason = (product as { noTreatmentReason?: string }).noTreatmentReason;
      droppedProducts.push({
        index: droppedProducts.length + 1,
        name,
        regNumber,
        exclusionReason:
          specificReason ||
          `Nessun trattamento generato per ${name}: il prodotto è compatibile con la coltura ma non sono state pianificate applicazioni`,
        category: categoria,
        product,
      });
    }
  }

  if (droppedProducts.length > 0) {
    console.log(
      `[FILL-JOB] ${droppedProducts.length} products passed filters but generated no treatments for unit ${unit.unitProductionId}`,
    );
  }

  // Merge explicitly excluded products with silently dropped products
  const originalExcluded =
    (unit as { excludedProducts?: ExcludedProduct[] }).excludedProducts || [];
  const allExcludedProducts = [...originalExcluded, ...droppedProducts];
  if (allExcludedProducts.length > 0) {
    // Deduplicate excluded products by name+regNumber (case-insensitive)
    const seenExcludedProducts = new Set<string>();
    const uniqueExcludedProducts = allExcludedProducts.filter((excluded) => {
      const key = `${excluded.name.toLowerCase()}|${normalizeRegistrationNumber(excluded.regNumber)}`;
      if (seenExcludedProducts.has(key)) {
        return false;
      }
      seenExcludedProducts.add(key);
      return true;
    });

    console.log(
      `[FILL-JOB] Creating ${uniqueExcludedProducts.length} zero-quantity jobs for excluded/dropped products in unit ${unit.unitProductionId} (deduplicated from ${allExcludedProducts.length})`,
    );

    for (const excluded of uniqueExcludedProducts) {
      const productName = excluded.name;
      const rawRegistrationNumber = excluded.regNumber;
      const normalizedRegNumber = normalizeRegistrationNumber(rawRegistrationNumber);

      // Find or create the product in DB
      const matchedProduct = await findOrCreateProduct(
        prisma,
        {
          name: productName,
          registrationNumber: rawRegistrationNumber || normalizedRegNumber,
          companyId: metadata.companyId,
          warehouseId: metadata.warehouseId,
        },
        productCache,
        warnings,
      );

      if (!matchedProduct) {
        warnings.push(
          `Cannot create zero-quantity job for excluded product ${productName}: product not found/created`,
        );
        continue;
      }

      // Build the exclusion note
      const exclusionNote = `[PRODOTTO ESCLUSO] ${excluded.exclusionReason}. Questo prodotto è stato proposto ma non selezionato per il trattamento.`;

      // Create a job with quantity 0 for tracking purposes
      const treatmentDate = new Date(); // Use current date as placeholder

      // Track in history
      if (input.historyManager) {
        const productKey = `${productName}|${normalizedRegNumber}`;
        const cropName = String((unit as { cropName?: string }).cropName ?? '');
        const variety = String((unit as { variety?: string }).variety ?? '');

        input.historyManager.addEntry(
          unit.unitProductionId,
          productKey,
          `Job quantity 0: Prodotto escluso dalla selezione`,
          excluded.exclusionReason,
          DosageAgentStep.JOB_CREATION,
          DataSource.LLM_OPENAI,
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
            description: `Prodotto non selezionato per il trattamento. Motivazione: ${excluded.exclusionReason}. Categoria: ${excluded.category || 'N/A'}`,
          },
        );
      }

      // Resolve cycleId using cached data
      const resolvedCycleId = batchLoader.resolveCycleId(
        unit.unitProductionId,
        unit.cycleId,
        treatmentDate,
      );

      // Create the zero-quantity job
      try {
        const { job } = await createJobUseCase.execute({
          productionUnitId: unit.unitProductionId,
          productionCycleId: resolvedCycleId,
          jobId: input.queueJobId ?? null,
          dateOfOpeation: treatmentDate,
          category: JobCategory.TREATMENT,
          quantity: 0,
          unitOfMeasureQuantity: 'kg',
          treatedSurface: 0,
          isLocalizedTreatment: null,
          note: exclusionNote,
          alertNotes: excludedProductInfoToJson({
            excluded_product: true,
            exclusion_reason: excluded.exclusionReason,
            product_category: excluded.category,
          }),
          appliedRules: productName
            ? ((input.appliedRulesByProduct?.get(
                buildAppliedRulesKey(unit.unitProductionId, productName),
              ) ?? null) as unknown as Prisma.JsonValue | null)
            : null,
          productQuantityTreated: 0,
          unitOfMeasureProductQuantityTreated: 'ha',
          stocks: [
            {
              productId: matchedProduct.id,
              quantity: 0,
              unitOfMeasureQuantity: 'kg',
              price: 0,
              unitOfMeasurePrice: DEFAULT_PRICE_UNIT,
              type: STOCK_OUT_TYPE,
            },
          ],
          history: input.historyManager
            ? historyToJson(
                input.historyManager.getEntries(
                  unit.unitProductionId,
                  `${productName}|${normalizedRegNumber}`,
                ),
              )
            : null,
          conformityChecked: true, // Prodotti esclusi sono già "verificati" come non applicabili
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

        if (jobWithRelations) {
          unitJobs.push(mapJob(jobWithRelations));
        }

        console.log(
          `[FILL-JOB] Created zero-quantity job ${job.id} for excluded product ${productName} (${rawRegistrationNumber})`,
        );
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        warnings.push(
          `Failed to create zero-quantity job for excluded product ${productName}: ${errorMsg}`,
        );
        console.error(`[FILL-JOB] Error creating zero-quantity job for ${productName}:`, error);
      }
    }
  }
}

export async function initializeFillRuntime(input: FillTheJobInput): Promise<{
  readonly stockRepository: PrismaStockRepository;
  readonly createJobUseCase: CreateJobUseCase;
  readonly jobsByUnit: Map<string, UnitScheduledJob[]>;
  readonly productionUnitCache: Map<string, ProductionUnitMetadata>;
  readonly productCache: Map<string, ProductSummary>;
  readonly warnings: string[];
  readonly batchLoader: BatchLoaderContext;
}> {
  const stockRepository = new PrismaStockRepository(prisma);
  const createJobUseCase = new CreateJobUseCase(
    new PrismaJobRepository(prisma),
    stockRepository,
  );
  const jobsByUnit = new Map<string, UnitScheduledJob[]>();
  const productionUnitCache = new Map<string, ProductionUnitMetadata>();
  const productCache = new Map<string, ProductSummary>();
  const warnings: string[] = [];
  const batchLoader = new BatchLoaderContext(prisma);
  const unitIds = input.units.map((unit) => unit.unitProductionId);
  await batchLoader.initialize(unitIds);
  console.log(`[FILL-JOB] Batch loader initialized for ${unitIds.length} units`);
  await ensureWarehouseStockForRequestedProducts({
    requestedProducts: input.requestedProducts,
    units: input.units,
    productionUnitCache,
    productCache,
    stockRepository,
    warnings,
  });
  return {
    stockRepository,
    createJobUseCase,
    jobsByUnit,
    productionUnitCache,
    productCache,
    warnings,
    batchLoader,
  };
}
