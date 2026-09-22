import type { ConformityViolation, JobWithRelations } from './types';
import { Label } from '../../../../domain/dtos/label.dto';
import { findMatchingDoseDetail } from './matchers';

/**
 * Checks dose range from label and returns violations and proposed quantity
 */
export function checkDoseRange(
  job: JobWithRelations,
  label: Label,
  dosePerHa: number,
  areaHa: number,
  llmMatchedCrops?: ReadonlyArray<string>,
): { violations: ConformityViolation[]; proposedQuantity: number; proposedNote: string } {
  const violations: ConformityViolation[] = [];
  let proposedQuantity = job.quantity;
  let proposedNote = '';

  const doseDetail = findMatchingDoseDetail(
    label,
    job.productionCycle?.cropName,
    job.productionCycle?.variety,
    llmMatchedCrops,
  );

  if (!doseDetail) {
    violations.push({
      type: 'DOSE_DETAIL_NOT_FOUND',
      message: `Nessun dettaglio dosaggio trovato in etichetta per la coltura "${job.productionCycle?.cropName ?? 'sconosciuta'}". Il controllo dose non è stato effettuato.`,
      severity: 'INFO',
      source: 'LABEL',
      field: 'dose',
    });
    return { violations, proposedQuantity, proposedNote };
  }

  if (doseDetail.dose_massima && dosePerHa > doseDetail.dose_massima) {
    violations.push({
      type: 'DISCIPLINARI_DOSE_EXCEEDED',
      message: `Dose ${dosePerHa.toFixed(2)} ${job.unitOfMeasureQuantity}/ha supera il massimo ${doseDetail.dose_massima} ${doseDetail.dose_um}`,
      severity: 'ERROR',
      source: 'LABEL',
      field: 'dose',
      currentValue: dosePerHa,
      expectedValue: doseDetail.dose_massima,
    });
    proposedQuantity = doseDetail.dose_massima * areaHa;
    proposedNote += ` [CONFORMITY] Dose ridotta da ${dosePerHa.toFixed(2)} a ${doseDetail.dose_massima} ${doseDetail.dose_um}/ha per rispettare il limite etichetta.`;
  }

  if (doseDetail.dose_minima && dosePerHa < doseDetail.dose_minima) {
    const minQuantityRequired = doseDetail.dose_minima * areaHa;
    violations.push({
      type: 'DISCIPLINARI_DOSE_BELOW_MIN',
      message: `Dose ${dosePerHa.toFixed(2)} ${job.unitOfMeasureQuantity}/ha sotto il minimo ${doseDetail.dose_minima} ${doseDetail.dose_um}. Quantità minima richiesta: ${minQuantityRequired.toFixed(2)} ${job.unitOfMeasureQuantity}`,
      severity: 'WARNING',
      source: 'LABEL',
      field: 'dose',
      currentValue: dosePerHa,
      expectedValue: doseDetail.dose_minima,
    });
    proposedQuantity = minQuantityRequired;
    proposedNote += ` [CONFORMITY] Dose aumentata da ${dosePerHa.toFixed(2)} a ${doseDetail.dose_minima} ${doseDetail.dose_um}/ha per rispettare il limite minimo etichetta.`;
  }

  return { violations, proposedQuantity, proposedNote };
}

/**
 * Applies user notes rules and returns informational violations
 */
export function applyUserNotesRules(userNotesRules: string[]): ConformityViolation[] {
  const violations: ConformityViolation[] = [];

  for (const rule of userNotesRules) {
    if (rule.toLowerCase().includes('evitare') || rule.toLowerCase().includes('non usare')) {
      violations.push({
        type: 'USER_NOTE_WARNING',
        message: `Regola utente: ${rule}`,
        severity: 'INFO',
        source: 'USER_NOTES',
      });
    }
  }

  return violations;
}
