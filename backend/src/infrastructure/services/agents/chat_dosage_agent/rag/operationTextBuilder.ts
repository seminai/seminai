/**
 * Utility functions to convert job operation data into text format
 * optimized for semantic search and embedding.
 */

import { JobCategory } from '@prisma/client';
import { JobWithAssignmentWithoutHistoryDTO } from '../../../../../domain/dtos/job-assignment.dto';
import type { JobOperationDocument, JobOperationMetadata } from './types';

/**
 * Maps JobCategory enum to Italian human-readable text.
 */
const CATEGORY_LABELS: Record<JobCategory, string> = {
  TREATMENT: 'Trattamento fitosanitario',
  SEEDING: 'Semina',
  FERTILIZATION: 'Fertilizzazione',
};

/**
 * Formats a date to Italian locale string.
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('it-IT', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Builds a searchable text representation of a job operation.
 * The text is structured to optimize semantic search for common queries like:
 * - Product names and active ingredients
 * - Dates and time periods
 * - Crops and adversities
 * - Quantities and doses
 *
 * @param dto The job with assignment data
 * @returns A structured text representation for embedding
 */
export function buildOperationText(dto: JobWithAssignmentWithoutHistoryDTO): string {
  const { job, productionUnit, products, fields, company, machine, dosageAgentJobName } = dto;

  const lines: string[] = [];

  // Category and date
  const categoryLabel = CATEGORY_LABELS[job.category] || job.category;
  lines.push(`Operazione: ${categoryLabel}`);
  lines.push(`Data: ${formatDate(job.dateOfOpeation)}`);

  // Job group name if available
  if (dosageAgentJobName) {
    lines.push(`Gruppo: ${dosageAgentJobName}`);
  }

  // Crop and production unit
  lines.push(`Coltura: ${productionUnit.cropName} (${productionUnit.cropType})`);
  lines.push(`Unità produttiva: ${productionUnit.name}`);

  // Products
  if (products.length > 0) {
    const productList = products
      .map((p) => {
        const regNum = p.registrationNumber ? ` (Reg. ${p.registrationNumber})` : '';
        return `${p.name}${regNum}`;
      })
      .join(', ');
    lines.push(`Prodotti: ${productList}`);
  }

  // Quantity and dose
  lines.push(`Quantità: ${job.quantity} ${job.unitOfMeasureQuantity}`);

  if (job.productQuantityTreated !== null && job.unitOfMeasureProductQuantityTreated) {
    lines.push(
      `Dose prodotto: ${job.productQuantityTreated} ${job.unitOfMeasureProductQuantityTreated}`,
    );
  }

  // Treated surface
  if (job.treatedSurface !== null) {
    lines.push(`Superficie trattata: ${job.treatedSurface} ha`);
  }

  // Water volume
  if (job.totalDistributedWaterL !== null) {
    lines.push(`Acqua distribuita: ${job.totalDistributedWaterL} L`);
  }

  // Adversity/target
  if (job.avversity) {
    lines.push(`Avversità/Bersaglio: ${job.avversity}`);
  }

  // Justification
  if (job.giustification) {
    lines.push(`Giustificazione: ${job.giustification}`);
  }

  // Application mode
  if (job.modeOfApplication) {
    lines.push(`Modalità applicazione: ${job.modeOfApplication}`);
  }

  // Localized treatment
  if (job.isLocalizedTreatment !== null) {
    lines.push(`Trattamento localizzato: ${job.isLocalizedTreatment ? 'Sì' : 'No'}`);
  }

  // Fields
  if (fields.length > 0) {
    const fieldList = fields.map((f) => f.name).join(', ');
    lines.push(`Campi: ${fieldList}`);
  }

  // Company
  lines.push(`Azienda: ${company.name}`);

  // Machine
  if (machine) {
    lines.push(`Macchina: ${machine.name} (${machine.identifier})`);
  }

  // Notes
  if (job.note) {
    lines.push(`Note: ${job.note}`);
  }

  // Verification status
  lines.push(`Stato: ${job.isVerified ? 'Verificato' : 'In attesa di verifica'}`);
  if (job.conformityChecked) {
    lines.push(`Conformità: Verificata`);
  }

  return lines.join('\n');
}

/**
 * Extracts metadata from a job operation for filtering and display.
 *
 * @param dto The job with assignment data
 * @returns Structured metadata for the operation
 */
export function extractOperationMetadata(
  dto: JobWithAssignmentWithoutHistoryDTO,
): JobOperationMetadata {
  const { job, productionUnit, products, fields, company } = dto;

  return {
    operationId: job.id,
    jobId: job.jobId,
    dateOfOperation: job.dateOfOpeation.toISOString(),
    category: job.category,
    productNames: products.map((p) => p.name),
    cropName: productionUnit.cropName,
    cropType: productionUnit.cropType,
    avversity: job.avversity,
    companyName: company.name,
    fieldNames: fields.map((f) => f.name),
    quantity: job.quantity,
    unitOfMeasure: job.unitOfMeasureQuantity,
  };
}

/**
 * Converts a JobWithAssignmentWithoutHistoryDTO to a JobOperationDocument
 * ready for indexing in the vector store.
 *
 * @param dto The job with assignment data
 * @returns A document with content and metadata for vector indexing
 */
export function buildOperationDocument(
  dto: JobWithAssignmentWithoutHistoryDTO,
): JobOperationDocument {
  return {
    content: buildOperationText(dto),
    metadata: extractOperationMetadata(dto),
  };
}

/**
 * Converts multiple job DTOs to documents in batch.
 *
 * @param dtos Array of jobs with assignment data
 * @returns Array of documents ready for vector indexing
 */
export function buildOperationDocuments(
  dtos: JobWithAssignmentWithoutHistoryDTO[],
): JobOperationDocument[] {
  return dtos.map(buildOperationDocument);
}
