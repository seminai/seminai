import { Label, isFitoLabel } from '../../../../domain/dtos/label.dto';
import { AlertNotesDTO, createEmptyAlertNotes } from '../../../../domain/dtos/alert-notes.dto';
import type { JobWithRelations, ProductWithLabel } from './types';
import { UnitAllowedProductsWithDosageOutput } from '../dosage_agent/flowMatchProductionUnitTreatmentDosage';
import { checkDdtDateConformity } from '../dosage_agent/ddtDateChecker';
import { convertDoseToHl, calculateWaterForJob } from '../dosage_agent/unitConversion';
import { findMatchingDoseDetail, findLabelForProduct } from './matchers';

/**
 * Builds unit data structure for active ingredient compatibility check
 */
export function buildUnitDataForCompatibilityCheck(
  jobs: JobWithRelations[],
  labelByRegNumber: Map<string, ProductWithLabel['label']>,
  labelByProductName: Map<string, ProductWithLabel['label']>,
): UnitAllowedProductsWithDosageOutput[] {
  const jobsByUnit = new Map<string, JobWithRelations[]>();
  for (const job of jobs) {
    const unitId = job.productionUnitId;
    if (!jobsByUnit.has(unitId)) {
      jobsByUnit.set(unitId, []);
    }
    jobsByUnit.get(unitId)!.push(job);
  }

  const result: UnitAllowedProductsWithDosageOutput[] = [];
  for (const [unitId, unitJobs] of jobsByUnit) {
    const firstJob = unitJobs[0];
    const products = unitJobs.map((job) => {
      const stock = job.stocks[0];
      const regNumber = stock?.product?.registrationNumber ?? '';
      const productName = stock?.product?.name ?? '';
      const unitAreaHa = job.productionUnit.areaHa;
      const labelExtraction = findLabelForProduct(
        regNumber,
        productName,
        labelByRegNumber,
        labelByProductName,
      );
      const label =
        labelExtraction && isFitoLabel(labelExtraction.label)
          ? (labelExtraction.label as Label)
          : null;
      return {
        name: productName,
        regNumber,
        label,
        trattamenti: [
          {
            dose: unitAreaHa > 0 ? job.quantity / unitAreaHa : job.quantity,
            data_distribuzione: job.dateOfOpeation,
            dosaggio_um: job.unitOfMeasureQuantity,
          },
        ],
      };
    });
    result.push({
      unitProductionId: unitId,
      cropName: firstJob.productionCycle?.cropName ?? undefined,
      variety: firstJob.productionCycle?.variety ?? undefined,
      areaHa: firstJob.productionUnit.areaHa,
      products,
      jobs: [],
    } as unknown as UnitAllowedProductsWithDosageOutput);
  }
  return result;
}

/**
 * Input for building conformity alert notes
 */
interface BuildAlertNotesInput {
  readonly label: Label | null;
  readonly job: JobWithRelations;
  readonly registrationNumber: string;
  readonly productId: string | null;
  readonly productName: string;
  readonly stockInWarehouse: number | null;
  readonly stockInWarehouseUm: string | null;
  readonly totalStockRequiredForJobs: number | null;
  readonly totalStockRequiredForJobsUm: string | null;
}

/**
 * Calculates stock out amount (negative means stock shortage)
 */
function calculateStockOut(
  stockInWarehouse: number | null,
  totalStockRequired: number | null,
): number | null {
  if (stockInWarehouse === null || totalStockRequired === null) {
    return null;
  }
  const stockOutAmount = totalStockRequired - stockInWarehouse;
  return stockOutAmount > 0 ? stockOutAmount : null;
}

/**
 * Builds alert notes similarly to dosage_agent
 */
export async function buildConformityAlertNotes(
  input: BuildAlertNotesInput,
): Promise<AlertNotesDTO> {
  const empty = createEmptyAlertNotes();

  const ddt = await checkDdtDateConformity(
    input.job.dateOfOpeation,
    input.registrationNumber,
    input.productId ?? undefined,
    input.productName,
  );

  const stockOut = calculateStockOut(input.stockInWarehouse, input.totalStockRequiredForJobs);

  if (!input.label) {
    return {
      ...empty,
      ddt_date_is_ok: ddt.ddt_date_is_ok ?? null,
      ddt_date_conformity: ddt.ddt_date_conformity ?? null,
      ddt_date_after_treatment: ddt.ddt_date_after_treatment ?? null,
      total_stock_required_for_jobs: input.totalStockRequiredForJobs,
      total_stock_required_for_jobs_um: input.totalStockRequiredForJobsUm,
      stock_in_warehouse: input.stockInWarehouse,
      stock_in_warehouse_um: input.stockInWarehouseUm,
      stock_out: stockOut,
      stock_out_um: input.stockInWarehouseUm,
    };
  }

  const doseDetail = findMatchingDoseDetail(
    input.label,
    input.job.productionCycle?.cropName,
    input.job.productionCycle?.variety,
  );

  const treatedSurfaceHa = input.job.productionUnit.areaHa;

  const waterValues = calculateWaterForJob({
    acquaMax: doseDetail?.acqua_max,
    acquaMaxUm: doseDetail?.acqua_max_um,
    treatedSurface: treatedSurfaceHa,
  });

  const doseMinHlJob = convertDoseToHl({
    dose: doseDetail?.dose_minima,
    doseUm: doseDetail?.dose_um,
    treatedSurface: treatedSurfaceHa,
  });

  const doseMaxHlJob = convertDoseToHl({
    dose: doseDetail?.dose_massima,
    doseUm: doseDetail?.dose_um,
    treatedSurface: treatedSurfaceHa,
  });

  return {
    ...empty,
    frasi_pericolo:
      input.label.frasi_pericolo && input.label.frasi_pericolo.length > 0
        ? input.label.frasi_pericolo
        : null,
    modalita_applicazione: doseDetail?.modalita_applicazione ?? null,
    n_max_applicazioni: doseDetail?.n_max_applicazioni ?? null,
    n_max_applicazioni_um: doseDetail?.n_max_applicazioni_um ?? null,
    dose_minima: doseDetail?.dose_minima ?? null,
    dose_massima: doseDetail?.dose_massima ?? null,
    dose_um: doseDetail?.dose_um ?? null,
    acqua_max: doseDetail?.acqua_max ?? null,
    acqua_max_um: doseDetail?.acqua_max_um ?? null,
    epoca_impiego: doseDetail?.epoca_impiego ?? null,
    note_tecniche: input.label.note_tecniche ?? null,
    fasce_di_rispetto_e_deriva:
      input.label.fasce_di_rispetto_e_deriva && input.label.fasce_di_rispetto_e_deriva.length > 0
        ? input.label.fasce_di_rispetto_e_deriva
        : null,
    fasce_rispetto_acqua: input.label.fasce_rispetto_acqua ?? null,
    fasce_rispetto_colture: input.label.fasce_rispetto_colture ?? null,
    colture_target_fuori_periodo_di_produzione:
      input.label.colture_target_fuori_periodo_di_prodizione ?? null,
    resistenze: input.label.resistenze ?? null,
    malattie: input.label.malattie ?? null,
    principio_attivo: input.label.principio_attivo ?? null,
    total_stock_required_for_jobs: input.totalStockRequiredForJobs,
    total_stock_required_for_jobs_um: input.totalStockRequiredForJobsUm,
    stock_in_warehouse: input.stockInWarehouse,
    stock_in_warehouse_um: input.stockInWarehouseUm,
    stock_out: stockOut,
    stock_out_um: input.stockInWarehouseUm,
    ddt_date_is_ok: ddt.ddt_date_is_ok ?? null,
    ddt_date_conformity: ddt.ddt_date_conformity ?? null,
    ddt_date_after_treatment: ddt.ddt_date_after_treatment ?? null,
    waterHlJob: waterValues.waterHlJob,
    acquaMaxJob: waterValues.acquaMaxJob,
    acquaMaxJob_um: waterValues.acquaMaxJob_um,
    dose_minima_hl_job: doseMinHlJob,
    dose_massima_hl_job: doseMaxHlJob,
  };
}

/**
 * Input for building conformity note
 */
interface BuildConformityNoteInput {
  readonly productName: string;
  readonly quantity: number;
  readonly unitOfMeasureQuantity: string;
  readonly treatedSurfaceHa: number;
  readonly existingNote: string | null;
  readonly proposedNote: string | undefined;
  readonly stockInWarehouse?: number | null;
  readonly totalStockRequired?: number | null;
}

/**
 * Builds the header line for conformity note
 */
function buildNoteHeader(
  productName: string,
  quantity: number,
  unitOfMeasureQuantity: string,
  treatedSurface: number,
): string {
  const dosePerHa = treatedSurface > 0 ? quantity / treatedSurface : null;
  if (dosePerHa !== null) {
    return `[CONFORMITY] Product: ${productName}. Quantity: ${quantity.toFixed(2)} ${unitOfMeasureQuantity}. Surface: ${treatedSurface.toFixed(4)} ha. Dose: ${dosePerHa.toFixed(4)} ${unitOfMeasureQuantity}/ha.`;
  }
  return `[CONFORMITY] Product: ${productName}. Quantity: ${quantity.toFixed(2)} ${unitOfMeasureQuantity}. Surface: ${treatedSurface.toFixed(4)} ha.`;
}

/**
 * Builds stock alert message
 */
function buildStockAlert(
  stockInWarehouse: number | null | undefined,
  totalStockRequired: number | null | undefined,
  unitOfMeasureQuantity: string,
): string {
  if (stockInWarehouse === null || stockInWarehouse === undefined) {
    return '';
  }
  if (totalStockRequired === null || totalStockRequired === undefined) {
    return '';
  }

  const stockOut = totalStockRequired - stockInWarehouse;
  if (stockOut > 0) {
    return ` ⚠️ ATTENZIONE: Stock insufficiente! Disponibile: ${stockInWarehouse.toFixed(2)} ${unitOfMeasureQuantity}, Richiesto totale: ${totalStockRequired.toFixed(2)} ${unitOfMeasureQuantity}. Mancano ${stockOut.toFixed(2)} ${unitOfMeasureQuantity}. Se verifichi questo job, il magazzino andrà sotto stock.`;
  }
  return ` Disponibile: ${stockInWarehouse.toFixed(2)} ${unitOfMeasureQuantity}, Richiesto: ${totalStockRequired.toFixed(2)} ${unitOfMeasureQuantity}.`;
}

/**
 * Builds conformity note with product info and stock alerts
 */
export function buildConformityNote(input: BuildConformityNoteInput): string {
  const header = buildNoteHeader(
    input.productName,
    input.quantity,
    input.unitOfMeasureQuantity,
    input.treatedSurfaceHa,
  );

  const stockAlert = buildStockAlert(
    input.stockInWarehouse,
    input.totalStockRequired,
    input.unitOfMeasureQuantity,
  );

  return [input.proposedNote, header, stockAlert].filter(Boolean).join(' ').trim();
}
